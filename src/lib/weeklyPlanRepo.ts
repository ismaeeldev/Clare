import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * weeklyPlanRepo — Step 6's data layer for `weekly_plans` (docs/05_DataModel.md
 * §2.4). Migrates PrepDimancheScreen off its old `clare_dernier_brief`
 * localStorage slot onto the real table — this was deliberately deferred
 * from Step 4.4 (disruption-replan needs a real accepted row to diff
 * against) and is Step 6's own prerequisite for the same reason.
 *
 * **Never overwrite an accepted plan** — the partial unique index
 * (`weekly_plans_one_accepted_per_week`, migration 0003) enforces at most
 * one accepted row per (user_id, week_start) at the DB level; accepting a
 * new plan for a week that already has one means superseding the old row
 * first, in the same transaction-equivalent sequence used here (update old
 * to 'superseded', then insert new as 'accepted' — never update a plan's
 * own content in place once accepted).
 */
export interface WeeklyPlanRow {
  id: string;
  user_id: string;
  week_start: string;
  version: number;
  status: "generating" | "accepted" | "failed" | "superseded";
  summary: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  generated_by_model: string | null;
  created_at: string;
  updated_at: string;
}

/** The current week's accepted plan, if one exists — this is disruption-replan's required input context (registry §2.3). */
export async function fetchAcceptedPlan(userId: string, weekStart: string): Promise<WeeklyPlanRow | null> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("weekly_plans").select("*").eq("user_id", userId).eq("week_start", weekStart).eq("status", "accepted").maybeSingle()
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data as WeeklyPlanRow | null) ?? null;
}

/**
 * Accepts a generated summary/plan as this week's official plan. If an
 * accepted plan already exists for this week, it's superseded first (its
 * own content stays intact for the "versioned brief, look back at any day"
 * feature — 04_ApplicationFlow.md §2.9 — only its status changes), then the
 * new plan is inserted as the next version, accepted.
 *
 * Runs via the `accept_weekly_plan` RPC (migration 0014) so the
 * supersede-then-insert sequence is one atomic transaction — a prior
 * two-round-trip client implementation could leave a week with ZERO
 * accepted plans if the insert failed right after the supersede succeeded.
 */
export async function acceptWeeklyPlan(
  userId: string,
  weekStart: string,
  summary: Record<string, unknown>,
  plan: Record<string, unknown>,
  generatedByModel: string
): Promise<WeeklyPlanRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase.rpc("accept_weekly_plan", {
        p_user_id: userId,
        p_week_start: weekStart,
        p_summary: summary,
        p_plan: plan,
        p_generated_by_model: generatedByModel,
      })
    )
  );
  if (error) throw error;
  return data as WeeklyPlanRow;
}
