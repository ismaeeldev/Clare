// account-delete — docs/03_MasterPrompts.md §7.6 task 4 / CLA-FR-023.
// Hard-deletes the calling user's own auth.users row via the Admin API
// (service role only — not available to a per-user client). Every
// user-owned table in this schema has `on delete cascade` from
// auth.users (verified against every migration: journal_entries,
// finance_entries, tasks, calendar_items, weekly_plans, meal_plans,
// agent_runs, action_proposals, notifications, subscriptions,
// shopping_list_checks, profiles, conversations, messages, ideas,
// focus_sessions, push_subscriptions) — so deleting the auth user is
// sufficient to remove every row across every table in one atomic DB
// operation, rather than manually deleting from each table individually
// (which would also risk missing a table if one is ever added without
// remembering to update a manual delete list here).
//
// Irreversible — the client (SettingsScreen.tsx) gates this behind its
// own re-confirm modal; this function itself does not re-prompt, it
// trusts the caller already confirmed. Only ever deletes the CALLING
// user's own account (userId comes from the verified JWT, never a
// client-supplied id) — there is no way to delete another user's account
// through this endpoint.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const client = getServiceClient();

    // The subscriptions row cascades away with the user below, but that
    // only removes Clare's own record — it does not touch the real Stripe
    // subscription, which keeps renewing and billing the (now-deleted)
    // user every month with no account left to cancel it from. Cancel the
    // live Stripe subscription first, while stripe_subscription_id is
    // still readable, so account deletion can never leave an orphaned
    // paying subscription behind.
    const { data: sub } = await client.from("subscriptions").select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
    if (sub?.stripe_subscription_id) {
      const stripe = getStripeClient();
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (err) {
        // Already canceled/doesn't exist on Stripe's side is fine (not an
        // error worth blocking account deletion over); anything else
        // should stop the deletion rather than silently proceed to delete
        // the only record of a subscription that's still live and billing.
        const code = (err as { code?: string })?.code;
        if (code !== "resource_missing") throw err;
      }
    }

    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw error;

    return new Response(JSON.stringify({ deleted: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
