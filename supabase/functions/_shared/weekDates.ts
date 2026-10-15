// Shared Monday-of-current-week helper — used by meal-plan-generate and
// disruption-replan, both of which need to key off the same week_start
// convention as weeklyPlanRepo.ts's client-side getWeekStart() (Monday,
// per docs/05_DataModel.md's week_start date convention for weekly_plans/
// meal_plans).
export function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export function getWeekStartKey(): string {
  return getWeekStart().toISOString().split("T")[0];
}
