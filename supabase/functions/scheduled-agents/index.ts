// scheduled-agents — docs/03_MasterPrompts.md §6.2 / docs/01_ScopeDocument.md
// CLA-FR-019. Cron-triggered (hourly, migration 0012_scheduled_agents_cron.sql)
// — NOT user-triggered, so this is the one function in this project that
// runs with the service-role key and must do its own per-user filtering
// (every other function relies on the caller's own JWT + RLS).
//
// Exactly three scheduled behaviors, no more:
//  - weekly_prep: Sunday, in the user's own timezone, outside quiet_hours —
//    a notification prompting Sunday Prep (never auto-generates a plan;
//    that's still an explicit user-initiated flow).
//  - upcoming_reminder: a confirmed calendar_items row starting in the
//    next ~2 hours that the user hasn't been reminded about yet.
//  - low_energy_suggestion: the last 3 journal_entries all show energy<=2
//    — a gentle suggestion notification, never a fabricated diagnosis.
//
// Every run is recorded in agent_runs with a unique idempotency_key so a
// duplicate cron invocation (or this job overlapping itself) can never
// double-fire the same job for the same user in the same window — the key
// encodes user_id + job_type + the specific time window, so a genuine
// re-run in a NEW window (next Sunday, next low-energy streak) is allowed,
// but a retry within the same window is not.
//
// Only ever creates a notification (and, for weekly_prep, nothing else —
// no draft/proposal since Sunday Prep is itself a full user-initiated
// flow) — never silently rewrites an accepted plan (same rule as
// disruption-replan).
import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";

interface ProfileRow {
  user_id: string;
  timezone: string | null;
  quiet_hours: { start?: string; end?: string } | null;
}

function nowInTimezone(timezone: string): Date {
  // Deno's Intl-backed approach: format "now" in the target timezone, then
  // re-parse — the standard workaround for JS having no native
  // timezone-aware Date arithmetic.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00`);
}

function isWithinQuietHours(localTime: Date, quietHours: { start?: string; end?: string } | null): boolean {
  if (!quietHours?.start || !quietHours?.end) return false;
  const [startH, startM] = quietHours.start.split(":").map(Number);
  const [endH, endM] = quietHours.end.split(":").map(Number);
  const nowMinutes = localTime.getHours() * 60 + localTime.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  // Quiet hours typically span midnight (e.g. 21:00-08:00) — handle both
  // the wraparound and same-day cases.
  if (startMinutes <= endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function dateKeyLocal(localTime: Date): string {
  return localTime.toISOString().split("T")[0];
}

async function recordRun(
  client: ReturnType<typeof getServiceClient>,
  userId: string,
  jobType: "weekly_prep" | "upcoming_reminder" | "low_energy_suggestion",
  idempotencyKey: string,
  resultSummary: Record<string, unknown>
): Promise<boolean> {
  // Idempotency check: if a run with this exact key already exists, skip —
  // this is what makes a duplicate cron invocation (or an overlapping run)
  // safe (CLA-FR-019's acceptance criterion).
  const { data: existing } = await client.from("agent_runs").select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return false;

  await client.from("agent_runs").insert({
    user_id: userId,
    job_type: jobType,
    trigger: "scheduled",
    status: "completed",
    result_summary: resultSummary,
    idempotency_key: idempotencyKey,
    completed_at: new Date().toISOString(),
  });
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // This function has no per-user logic to gate on (it iterates ALL
  // users) — Supabase's platform-level JWT verification alone only proves
  // the caller is SOME authenticated user, not that the call is genuinely
  // from cron. Without this check, any signed-in user could call this
  // endpoint directly and force it to run for every user repeatedly (a
  // real DoS/abuse vector, found in this session's own adversarial
  // review, not live-observed as exploited). The cron job in migration
  // 0012 authenticates with the literal service-role key as its bearer
  // token — require exactly that here too.
  // Not gated on SUPABASE_SERVICE_ROLE_KEY: this project has both a legacy
  // JWT-format service_role key and a newer `sb_secret_...`-format key,
  // and `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` inside the Edge
  // Function runtime resolves to the new format (confirmed live this
  // session: 41 chars, "sb_secret_..." prefix) — but that key's full
  // value isn't retrievable via the Supabase CLI (always shown redacted),
  // so there was no reliable way to also configure the cron job's caller
  // to send the exact matching string. Using a dedicated shared secret
  // instead sidesteps that entirely: generated once, stored only in
  // Supabase Vault (CLARE_CRON_SECRET) and this function's own env
  // (CLARE_CRON_SECRET), never committed anywhere.
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  const cronSecret = Deno.env.get("CLARE_CRON_SECRET");
  if (!cronSecret || callerToken !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  try {
    const client = getServiceClient();
    const summary = { weekly_prep: 0, upcoming_reminder: 0, low_energy_suggestion: 0, users_checked: 0 };

    // PostgREST caps a single select at 1000 rows by default — this
    // function iterates over EVERY onboarded user (unlike every other
    // function in this project, which is scoped to one user via RLS), so
    // an unpaginated select would silently stop scheduling notifications
    // for any user past the 1000th once the app grows past that size.
    // Same class of bug caught and fixed earlier in nutrition-calc this
    // session — paginate explicitly rather than trusting the row count.
    const PAGE_SIZE = 1000;
    const profiles: ProfileRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error: profilesError } = await client
        .from("profiles")
        .select("user_id, timezone, quiet_hours")
        .eq("onboarding_complete", true)
        .range(from, from + PAGE_SIZE - 1);
      if (profilesError) throw profilesError;
      profiles.push(...((page ?? []) as ProfileRow[]));
      if (!page || page.length < PAGE_SIZE) break;
    }

    for (const profile of profiles) {
      summary.users_checked++;
      const timezone = profile.timezone || "Europe/Paris";
      const localNow = nowInTimezone(timezone);
      const inQuietHours = isWithinQuietHours(localNow, profile.quiet_hours);

      // --- weekly_prep: Sunday, outside quiet hours ---
      if (localNow.getDay() === 0 && !inQuietHours) {
        const idempotencyKey = `weekly_prep:${profile.user_id}:${dateKeyLocal(localNow)}`;
        const created = await recordRun(client, profile.user_id, "weekly_prep", idempotencyKey, { local_time: localNow.toISOString() });
        if (created) {
          await client.from("notifications").insert({
            user_id: profile.user_id,
            type: "weekly_prep",
            title: "C'est dimanche — prépare ta semaine",
            body: "3 minutes suffisent pour que Claré prépare toute ta semaine.",
            deep_link: "/prep-dimanche",
          });
          summary.weekly_prep++;
        }
      }

      // --- upcoming_reminder: a confirmed item starting in the next ~2h ---
      if (!inQuietHours) {
        const nowUtc = new Date();
        const twoHoursOut = new Date(nowUtc.getTime() + 2 * 60 * 60 * 1000);
        const { data: upcoming } = await client
          .from("calendar_items")
          .select("id, title, starts_at")
          .eq("user_id", profile.user_id)
          .eq("status", "confirmed")
          .gte("starts_at", nowUtc.toISOString())
          .lt("starts_at", twoHoursOut.toISOString())
          .order("starts_at", { ascending: true })
          .limit(1);

        if (upcoming && upcoming.length > 0) {
          const item = upcoming[0];
          // Idempotency window keyed to the hour, not the specific item —
          // this job runs hourly, so "the next upcoming item as of this
          // hour" is naturally deduplicated per hour without needing to
          // track exactly which item was already notified.
          const hourKey = localNow.toISOString().slice(0, 13);
          const idempotencyKey = `upcoming_reminder:${profile.user_id}:${hourKey}`;
          const created = await recordRun(client, profile.user_id, "upcoming_reminder", idempotencyKey, { item_id: item.id, title: item.title });
          if (created) {
            const startTime = new Date(item.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
            await client.from("notifications").insert({
              user_id: profile.user_id,
              type: "upcoming_reminder",
              title: "Rendez-vous à venir",
              body: `${item.title} à ${startTime}`,
              deep_link: "/agenda",
            });
            summary.upcoming_reminder++;
          }
        }
      }

      // --- low_energy_suggestion: last 3 journal entries all energy<=2 ---
      if (!inQuietHours) {
        const { data: recentEntries } = await client
          .from("journal_entries")
          .select("entry_date, energy")
          .eq("user_id", profile.user_id)
          .order("entry_date", { ascending: false })
          .limit(3);

        if (recentEntries && recentEntries.length === 3 && recentEntries.every((e) => typeof e.energy === "number" && e.energy <= 2)) {
          const idempotencyKey = `low_energy_suggestion:${profile.user_id}:${recentEntries[0].entry_date}`;
          const created = await recordRun(client, profile.user_id, "low_energy_suggestion", idempotencyKey, {
            entry_dates: recentEntries.map((e) => e.entry_date),
          });
          if (created) {
            await client.from("notifications").insert({
              user_id: profile.user_id,
              type: "low_energy_suggestion",
              title: "3 jours difficiles d'affilée",
              body: "Ton énergie est basse depuis quelques jours — un jour plus léger cette semaine ?",
              deep_link: "/journal",
            });
            summary.low_energy_suggestion++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ summary }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
