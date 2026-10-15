import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Per-user daily message quota — docs/06_AIPromptRegistry.md §3: "Per-user
 * daily/monthly token quota, enforced server-side before calling
 * Anthropic." Counting messages rather than tokens for now (a coarser but
 * simple, cheap-to-query proxy — the registry doesn't mandate exact token
 * accounting for this first pass, just that SOME server-side cap exists
 * before every Anthropic call).
 */
const DAILY_MESSAGE_LIMIT = 200;

export async function checkDailyMessageLimit(client: SupabaseClient, userId: string): Promise<{ allowed: boolean; count: number }> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since.toISOString());

  if (error) {
    // Fail closed would block a user over an infra hiccup on a read-only
    // count query — fail open here (allow the call) since this is a cost
    // guardrail, not a security boundary; RLS/auth are the real gates.
    return { allowed: true, count: 0 };
  }

  const used = count ?? 0;
  return { allowed: used < DAILY_MESSAGE_LIMIT, count: used };
}
