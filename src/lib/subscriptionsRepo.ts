import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * subscriptionsRepo — Step 7's data layer for `subscriptions`
 * (docs/05_DataModel.md §2.11). Read-only from the client — this table is
 * server-writes-only (only stripe-webhook writes it, via the service role
 * key), matching migration 0007_billing.sql's RLS: a select_own policy
 * only, no client insert/update/delete policy at all.
 */
export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
  current_period_end: string | null;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchSubscription(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle()),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data as SubscriptionRow | null) ?? null;
}
