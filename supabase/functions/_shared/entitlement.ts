import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Server-side entitlement check — docs/03_MasterPrompts.md §7.2 task 4 /
 * CLA-FR-021 hard requirement: "a UI-only paywall is explicitly called
 * out as insufficient." Every Edge Function representing a paid feature
 * must check the caller's subscriptions.status here — never trust a
 * client-side flag, since a client can always be tampered with (devtools,
 * a forged request body, a modified bundle).
 *
 * This app has a single subscription plan (docs/03_MasterPrompts.md
 * §7.1: "the single subscription lifecycle") — every AI-powered feature
 * is the paid feature, there's no separate free tier split to model.
 * `trialing` counts as entitled (a trial IS access, by definition);
 * `active` counts as entitled; `past_due`/`canceled`/`incomplete` and "no
 * subscriptions row at all" do not.
 */
const ENTITLED_STATUSES = new Set(["active", "trialing"]);

export async function checkEntitlement(client: SupabaseClient, userId: string): Promise<{ entitled: boolean; status: string | null }> {
  const { data, error } = await client.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
  if (error) {
    // Fail closed for entitlement (unlike the daily-message rate limit,
    // which fails open) — an infra hiccup here must not accidentally
    // grant free access to a paid feature.
    return { entitled: false, status: null };
  }
  if (!data) return { entitled: false, status: null };
  return { entitled: ENTITLED_STATUSES.has(data.status ?? ""), status: data.status };
}
