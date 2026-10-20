// stripe-checkout — docs/03_MasterPrompts.md §7.2 task 1.
// Creates a Stripe Checkout Session for the one approved plan
// (TODO_CLIENT_PRICING — docs/01_ScopeDocument.md §6: no real pricing
// decision has been made yet; STRIPE_PRICE_ID is a placeholder env var
// until then, see docs/PAYMENT_SETUP.md). Returns the session URL for the
// client to redirect to. The only write this function makes to
// `subscriptions` is the non-entitling 'incomplete' claim-lock row below
// (migration 0021) — actual entitlement is still granted server-side only
// by stripe-webhook once Stripe confirms payment (CLA-FR-021: never
// optimistically on the client).
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";
import { getStripeClient, getPriceId } from "../_shared/stripeClient.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const client = getUserClient(req)!;

    // Nothing previously stopped an already-entitled user from creating a
    // SECOND checkout session — Stripe doesn't prevent this itself, so
    // without this check a user tapping "S'abonner" twice (e.g. a slow
    // page, a double-tap, revisiting an old bookmark) while already
    // active/trialing could end up with two real subscriptions and get
    // double-billed. Fail with a clear message instead of silently
    // allowing it — found in adversarial review, not a live incident.
    const { entitled } = await checkEntitlement(client, userId);
    if (entitled) {
      return new Response(JSON.stringify({ error: "Tu as déjà un abonnement actif." }), {
        status: 409,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Atomic claim against a double-tap / two-tabs race: checkEntitlement
    // above only catches an ALREADY-active subscription — two
    // near-simultaneous requests from a not-yet-subscribed user would both
    // pass that check and both create a real Stripe session, since
    // subscriptions is only written later by stripe-webhook. This RPC
    // (migration 0021) claims a short-lived 'incomplete' placeholder row;
    // only one concurrent caller can ever get claimed:true.
    const { data: claimed, error: claimError } = await getServiceClient().rpc("claim_checkout_lock", { p_user_id: userId });
    if (claimError) {
      return new Response(JSON.stringify({ error: "Impossible de démarrer le paiement — réessaie." }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    if (!claimed) {
      return new Response(JSON.stringify({ error: "Une session de paiement est déjà en cours. Réessaie dans quelques instants." }), {
        status: 409,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const successUrl: string | undefined = body.success_url;
    const cancelUrl: string | undefined = body.cancel_url;
    if (!successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: "success_url and cancel_url are required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data: userData } = await client.auth.getUser();
    const email = userData.user?.email;

    // Reuse an existing Stripe customer id if this user already has one
    // (e.g. a past canceled subscription) rather than creating a
    // duplicate customer record every time they check out.
    const { data: existingSub } = await client.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: getPriceId(), quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: existingSub?.stripe_customer_id || undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : email,
      client_reference_id: userId,
      subscription_data: { metadata: { user_id: userId } },
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
