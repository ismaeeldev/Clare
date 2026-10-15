// stripe-webhook — docs/03_MasterPrompts.md §7.2 task 2. The ONLY place in
// this app that writes to `subscriptions` — CLA-FR-021 requires
// entitlement to be granted server-side only after Stripe's own
// confirmation, never optimistically from the client (stripe-checkout
// only ever creates a Checkout Session and returns a redirect URL, it
// never touches subscriptions itself).
//
// Verifies the Stripe signature (never trusts an unsigned/unverified
// payload), and is idempotent via webhook_events.stripe_event_id (unique)
// — a duplicate delivery of the same event (Stripe retries on a slow
// 2xx, and the master prompt's own test explicitly replays the same
// event via the Stripe CLI) must not double-process.
//
// verify_jwt is OFF for this function (deployed with --no-verify-jwt) —
// Stripe's webhook caller can never present a Supabase-issued JWT, it
// authenticates via the Stripe-Signature header instead, verified against
// STRIPE_WEBHOOK_SECRET below. This is the same class of exception as
// scheduled-agents (Step 6) needing --no-verify-jwt for its cron caller.
import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";
import type Stripe from "npm:stripe@22";

const HANDLED_EVENTS = new Set(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed"]);

async function upsertSubscriptionFromStripeSubscription(client: ReturnType<typeof getServiceClient>, sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.user_id;
  if (!userId) {
    // Every subscription created via stripe-checkout carries user_id in
    // subscription_data.metadata — if it's missing, this subscription
    // didn't originate from this app's checkout flow (e.g. created
    // manually in the Stripe dashboard) and there's no safe user row to
    // attach it to. Log and skip rather than guessing.
    console.log(JSON.stringify({ event: "stripe_webhook_missing_user_id", stripe_subscription_id: sub.id }));
    return;
  }
  const priceId = sub.items.data[0]?.price?.id ?? null;
  // `subscriptions.status`'s check constraint (docs/05_DataModel.md §2.11,
  // migration 0007_billing.sql) is a deliberately narrower set than
  // Stripe's real Subscription.status enum — it doesn't list `unpaid`,
  // `paused`, or `incomplete_expired`. Passing one of those straight
  // through would fail the DB constraint, and Postgres/PostgREST would
  // reject the whole upsert — the webhook would 500, Stripe would retry
  // and eventually give up, and this subscription's real state would
  // never get recorded at all. Map anything outside the app's known set
  // to the constraint-safe status that best represents "not currently
  // entitled" rather than letting the write fail outright.
  const KNOWN_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "incomplete"]);
  const mappedStatus = KNOWN_STATUSES.has(sub.status) ? sub.status : "canceled";
  if (!KNOWN_STATUSES.has(sub.status)) {
    console.log(JSON.stringify({ event: "stripe_webhook_unmapped_status", stripe_subscription_id: sub.id, raw_status: sub.status, mapped_to: mappedStatus }));
  }
  // `updated_at` has a `default now()` for INSERT but no DB trigger to
  // auto-bump it on UPDATE (confirmed: no such trigger exists anywhere in
  // this project's migrations) — an upsert that transitions an EXISTING
  // row's status (e.g. active → canceled) would otherwise leave
  // updated_at frozen at whenever the row was first created. That
  // silently broke admin-metrics' "cancellations in the last N days"
  // query, which filters on updated_at — a subscription created weeks
  // ago and canceled today would never show up as a recent cancellation.
  // Set it explicitly here rather than trusting a DB-side default that
  // only fires on insert.
  await client.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      status: mappedStatus,
      current_period_end: new Date(sub.items.data[0]?.current_period_end ? sub.items.data[0].current_period_end * 1000 : Date.now()).toISOString(),
      plan_id: priceId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("Stripe-Signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!signature || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Webhook not configured — see docs/PAYMENT_SETUP.md" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const stripe = getStripeClient();

    let event: Stripe.Event;
    try {
      // constructEventAsync (not constructEvent) — Deno's SubtleCrypto-based
      // signature verification is async, unlike Node's.
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      return new Response(JSON.stringify({ error: `Signature verification failed: ${message}` }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const client = getServiceClient();

    // Idempotency: insert first, with the unique constraint on
    // stripe_event_id doing the actual dedup work — a second delivery of
    // the same event hits the unique violation and is treated as
    // "already processed," never re-applying the event's side effects.
    const { error: insertError } = await client.from("webhook_events").insert({
      stripe_event_id: event.id,
      type: event.type,
      payload_summary: { object_id: (event.data.object as { id?: string }).id },
    });
    if (insertError) {
      if (insertError.code === "23505") {
        // Unique violation — already processed this exact event.
        return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      throw insertError;
    }

    if (HANDLED_EVENTS.has(event.type)) {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "subscription" && typeof session.subscription === "string") {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            await upsertSubscriptionFromStripeSubscription(client, sub);
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await upsertSubscriptionFromStripeSubscription(client, sub);
          break;
        }
        case "invoice.payment_failed": {
          // Field path confirmed against Stripe's own API changelog: the
          // "basil" API family (2025-03-31.basil onward, including the
          // 2025-08-27.basil version pinned in _shared/stripeClient.ts)
          // moved subscription linkage under invoice.parent
          // (discriminated by parent.type) — the older flat
          // invoice.subscription field was removed as a breaking change
          // in that same release.
          const invoice = event.data.object as Stripe.Invoice;
          const subRef = invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details?.subscription : undefined;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await upsertSubscriptionFromStripeSubscription(client, sub);
          }
          break;
        }
      }
    }

    await client.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
