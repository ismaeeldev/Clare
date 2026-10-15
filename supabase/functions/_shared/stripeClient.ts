import Stripe from "npm:stripe@22";

/**
 * Shared Stripe client — Step 7.2. STRIPE_SECRET_KEY must be set as an
 * Edge Function secret (`supabase secrets set STRIPE_SECRET_KEY=sk_test_...`)
 * before any of the stripe-* functions can work; see
 * docs/PAYMENT_SETUP.md for the full manual setup walkthrough (pricing,
 * webhook registration, test-mode keys — none of this can be automated by
 * an AI agent, it requires a real Stripe account).
 */
export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY not configured — see docs/PAYMENT_SETUP.md");
  }
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
}

/**
 * The one approved plan's price id (docs/03_MasterPrompts.md §7.2 task 1:
 * "use the test-mode price ID from Step 0.5; mark the actual price as
 * TODO_CLIENT_PRICING"). No real pricing decision has been made yet
 * (docs/01_ScopeDocument.md §6) — this reads from an env var rather than a
 * hardcoded literal so the placeholder can be swapped for a real price id
 * without a code change once pricing is decided.
 */
export function getPriceId(): string {
  const priceId = Deno.env.get("STRIPE_PRICE_ID");
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID not configured (TODO_CLIENT_PRICING — see docs/PAYMENT_SETUP.md)");
  }
  return priceId;
}
