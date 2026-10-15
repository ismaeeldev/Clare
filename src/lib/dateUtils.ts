/**
 * Date/time utilities — extracted from App.jsx lines 278-333 (`todayKey`,
 * `todayFr`, `getMorningEvening`). French locale formatting preserved
 * exactly. `nowHour`/`timeFr` are added here too since Chat/Journal (later
 * batches) will need them and this is their natural shared home.
 */
/**
 * Local-date key (YYYY-MM-DD) — NEVER use `date.toISOString().split("T")[0]`
 * for this: `toISOString()` converts to UTC first, which silently shifts
 * the date backward by one day for any local midnight that falls after
 * 00:00 UTC (i.e. any timezone east of UTC, incl. Europe/Paris in summer
 * and everything from UTC+1 to UTC+12). That mismatch was caught live:
 * meal-plan-generate (Edge Function, computes week_start in UTC via
 * _shared/weekDates.ts) and NutritionScreen's own fetchMealPlan/
 * fetchShoppingChecks (client, was keying off `getWeekStart().toISOString()`)
 * disagreed on week_start in UTC+5, so a freshly generated plan was
 * immediately invisible to the screen that just generated it (all
 * calories showed 0/—, shopping list never rendered). Same bug class
 * existed in PrepDimancheScreen's acceptWeeklyPlan call and HomeRoute's
 * fetchAcceptedPlan call. Use this helper (or dateKey(date)) everywhere a
 * *local* calendar date needs to become a DB date-key.
 */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const todayKey = () => dateKey(new Date());
export const nowHour = () => new Date().getHours();
export const todayFr = () =>
  new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const timeFr = () =>
  new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export interface MorningEvening {
  mode: "matin" | "aprem" | "soir";
  salut: string;
  emoji: string;
}

export function getMorningEvening(): MorningEvening {
  const h = nowHour();
  if (h < 12) return { mode: "matin", salut: "Bonjour", emoji: "☀️" };
  if (h < 18) return { mode: "aprem", salut: "Bon après-midi", emoji: "⚡" };
  return { mode: "soir", salut: "Bonsoir", emoji: "🌙" };
}

/**
 * Week boundaries — added for Step 3.3's Agenda week view. Weeks start
 * Monday (French convention), per docs/04_ApplicationFlow.md §2.5's
 * "week view" spec. `offsetWeeks` shifts by whole weeks (negative = past,
 * positive = future) for the swipe/arrow week-to-week navigation.
 */
export function getWeekStart(offsetWeeks = 0, from = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diffToMonday + offsetWeeks * 7);
  return d;
}

export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7);
  return d;
}

export function formatWeekRangeFr(weekStart: Date, weekEnd: Date): string {
  const end = new Date(weekEnd);
  end.setDate(end.getDate() - 1);
  const startLabel = weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${startLabel} – ${endLabel}`;
}
