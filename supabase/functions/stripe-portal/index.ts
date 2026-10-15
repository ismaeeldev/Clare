// stripe-portal — docs/03_MasterPrompts.md §7.2 task 3. Creates a Stripe
// Customer Portal session for "Manage subscription" (cancel, update
// payment method, view invoices — all handled by Stripe's own hosted UI,
// never rebuilt in this app).
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
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
    const client = getUserClient(req)!;

    const body = await req.json().catch(() => ({}));
    const returnUrl: string | undefined = body.return_url;
    if (!returnUrl) {
      return new Response(JSON.stringify({ error: "return_url is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const { data: sub } = await client.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Aucun abonnement Stripe trouvé pour ce compte." }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: returnUrl });

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
