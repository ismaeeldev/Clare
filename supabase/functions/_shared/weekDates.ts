// Shared Monday-of-current-week helper — used by meal-plan-generate and
// disruption-replan, both of which need to key off the same week_start
// convention as weeklyPlanRepo.ts's client-side getWeekStart() (Monday,
// per docs/05_DataModel.md's week_start date convention for weekly_plans/
// meal_plans).
//
// Previously computed the Monday boundary from UTC day-of-week/UTC
// midnight — Europe/Paris is UTC+1/+2, so for the ~1-2 hours after Paris
// midnight each day, the UTC calendar date is still "yesterday." On a
// Monday, that meant this function's own boundary (UTC-midnight-Monday)
// was 1-2 hours AFTER the real Paris-midnight-Monday, so a calendar item
// or meal plan edit made in the first hour or two of Monday (Paris time)
// would still carry a Sunday-UTC timestamp and fall OUTSIDE the "this
// week" range query — silently attributed to the previous week instead,
// directly matching a client report of "7-day stats are wrong."
import { parisDateParts, parisMidnightInstant } from "./dateContext.ts";

export function getWeekStart(): Date {
  const { iso: todayParis, weekdayIndex } = parisDateParts();
  // weekdayIndex: 0=Sunday..6=Saturday (Europe/Paris)
  const diffToMonday = weekdayIndex === 0 ? -6 : 1 - weekdayIndex;
  // Compute the target Monday's Y-M-D via calendar-date arithmetic (on
  // UTC-constructed date components, used only as a date-math scratch
  // value, never as the final instant) rather than adding raw
  // milliseconds to a Paris-midnight instant — the latter would be off
  // by an hour if diffToMonday's span crosses Europe/Paris's DST
  // transition, since a flat 24h/day addition doesn't know the Paris UTC
  // offset changed partway through. Re-deriving the correct Paris
  // midnight instant from the resulting calendar date (like
  // buildDateContextText's own 7-day table already does) keeps each
  // day's offset independently correct.
  const [y, m, d] = todayParis.split("-").map(Number);
  const mondayScratch = new Date(Date.UTC(y, m - 1, d + diffToMonday));
  const mondayDateKey = mondayScratch.toISOString().split("T")[0];
  return parisMidnightInstant(mondayDateKey);
}

export function getWeekStartKey(): string {
  return parisDateParts(getWeekStart()).iso;
}
