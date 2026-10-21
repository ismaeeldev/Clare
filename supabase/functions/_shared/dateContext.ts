// Shared "what is today" context injected into every AI prompt that must
// resolve relative date references ("demain", "vendredi", "mardi
// prochain"). Claude has no reliable notion of the real current date on
// its own — a user report confirmed it: "next Tuesday" was resolved to a
// date from the model's training period, not the real calendar date,
// silently creating appointments in the past (invisible in the calendar,
// and corrupting weekly stats that key off a correct week range). The
// report explicitly asked for this to be computed in Europe/Paris, not
// server UTC — this app's only users are French, but the Supabase
// project's Postgres/Deno runtime both default to UTC. Paris is UTC+1 or
// UTC+2 (DST), so for the ~1-2 hours after local midnight the UTC date is
// still "yesterday" — a naive `new Date().toISOString()` during that
// window would tell the model the wrong "today" and misdate every
// relative reference resolved against it. Intl.DateTimeFormat with an
// explicit timeZone handles the DST transition automatically (no manual
// offset math, which would itself need twice-yearly updating and is
// exactly the kind of date arithmetic this function exists to avoid
// asking Claude to do).
const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const PARIS_TZ = "Europe/Paris";

// Returns the calendar date (YYYY-MM-DD) and day-of-week, as they are
// RIGHT NOW in Europe/Paris, for the given UTC instant. Exported so other
// server-side "what day is it" computations (a daily idempotency key, a
// week-start boundary) can share this one correct implementation instead
// of each re-deriving their own UTC-based `new Date().toISOString()` —
// exactly the bug class this file exists to fix.
export function parisDateParts(instant: Date = new Date()): { iso: string; weekdayIndex: number } {
  const parisDateStr = instant.toLocaleDateString("en-CA", { timeZone: PARIS_TZ }); // en-CA locale formats as YYYY-MM-DD
  const weekdayName = instant.toLocaleDateString("en-US", { timeZone: PARIS_TZ, weekday: "long" }).toLowerCase();
  const weekdayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekdayName);
  return { iso: parisDateStr, weekdayIndex };
}

// Today's date (YYYY-MM-DD) in Europe/Paris — the correct replacement for
// `new Date().toISOString().split("T")[0]`, which is UTC and therefore
// off by one day for the ~1-2 hours after Paris midnight.
export function todayKeyParis(): string {
  return parisDateParts().iso;
}

// Europe/Paris's UTC offset (in minutes) AT the given instant — varies
// between UTC+1 (CET, winter) and UTC+2 (CEST, summer DST). Computed via
// Intl rather than hardcoded so it stays correct across the twice-yearly
// DST transition without needing a manual update.
function parisOffsetMinutesAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce((acc, p) => { if (p.type !== "literal") acc[p.type] = p.value; return acc; }, {} as Record<string, string>);
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asIfUtc - instant.getTime()) / 60000;
}

// Converts a Paris-local calendar date (YYYY-MM-DD) into the real UTC
// instant of that date's 00:00:00 in Europe/Paris — i.e. the correct
// absolute boundary for "this Paris-local day starts here," as opposed
// to naively building `new Date(dateKey + "T00:00:00Z")`, which is
// midnight UTC, 1-2 hours AFTER the true Paris midnight (Paris is ahead
// of UTC) — a range query using that naive boundary would wrongly
// exclude anything timestamped in the first 1-2 hours of the Paris day
// (e.g. a calendar item at 00:30 Monday Paris time would still carry a
// Sunday UTC timestamp and fall outside a "this week starts Monday UTC
// midnight" query), silently dropping it from "this week"/"today".
export function parisMidnightInstant(parisDateKey: string): Date {
  const naiveUtcGuess = new Date(`${parisDateKey}T00:00:00Z`);
  const offsetMinutes = parisOffsetMinutesAt(naiveUtcGuess);
  return new Date(naiveUtcGuess.getTime() - offsetMinutes * 60000);
}

export function buildDateContextText(): string {
  const now = new Date();
  const { iso: today, weekdayIndex } = parisDateParts(now);
  const todayWeekday = WEEKDAYS_FR[weekdayIndex];
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    // Add whole days in UTC (24h increments) then re-read the Paris
    // calendar date/weekday for that instant — correct even across a
    // Paris DST transition within the 7-day window, since each day's
    // Paris-local date is recomputed independently rather than assumed
    // to advance by exactly 24h of wall-clock time.
    const d = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const parts = parisDateParts(d);
    return `${WEEKDAYS_FR[parts.weekdayIndex]}=${parts.iso}`;
  }).join(", ");
  return `Date d'aujourd'hui (fuseau horaire Europe/Paris) : ${today} (${todayWeekday}). Table des 7 prochains jours pour résoudre les références relatives ("demain", "vendredi", "vendredi prochain") — utilise EXACTEMENT ces dates, ne recalcule rien toi-même : ${next7Days}.`;
}
