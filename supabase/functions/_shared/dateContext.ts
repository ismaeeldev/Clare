// Shared "what is today" context injected into every AI prompt that must
// resolve relative date references ("demain", "vendredi", "mardi
// prochain"). Claude has no reliable notion of the real current date on
// its own — a user report confirmed it: "next Tuesday" was resolved to a
// date from the model's training period, not the real calendar date,
// silently creating appointments in the past (invisible in the calendar,
// and corrupting weekly stats that key off a correct week range).
//
// Mirrors clerk-extract's already-correct approach (itself written to fix
// an earlier, narrower version of this same bug — see git history on
// disruption-replan's "vendredi" off-by-one fix): give the model a
// precomputed weekday name and a full next-7-days lookup table, and tell
// it to use those values EXACTLY rather than compute anything itself —
// date arithmetic is exactly the class of thing LLMs get wrong.
const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function buildDateContextText(): string {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const todayWeekday = WEEKDAYS_FR[now.getUTCDay()];
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return `${WEEKDAYS_FR[d.getUTCDay()]}=${d.toISOString().split("T")[0]}`;
  }).join(", ");
  return `Date d'aujourd'hui : ${today} (${todayWeekday}). Table des 7 prochains jours pour résoudre les références relatives ("demain", "vendredi", "vendredi prochain") — utilise EXACTEMENT ces dates, ne recalcule rien toi-même : ${next7Days}.`;
}
