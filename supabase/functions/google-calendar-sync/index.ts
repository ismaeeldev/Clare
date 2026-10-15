// google-calendar-sync — pulls the user's Google Calendar events into
// calendar_items (source='google_calendar'). Trigger: once right after a
// successful connect (client calls this immediately after the
// google_calendar=connected redirect lands), and again on-demand via a
// manual "Synchroniser" action — there is no background/cron sync in this
// first pass (scope decision: read-only, pull-based, matching the "Connect
// + sync into the app's own agenda" scope agreed for this feature, not a
// live webhook-driven two-way sync).
//
// Read-only scope (calendar.readonly, requested in google-oauth-start) —
// this function only ever reads from Google and writes to Clare's own
// calendar_items; it never calls Google's write endpoints and never
// touches a user's real Google Calendar.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SYNC_WINDOW_PAST_DAYS = 28;
const SYNC_WINDOW_FUTURE_DAYS = 56;
const MAX_EVENTS = 250;

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number } | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 3600 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const userClient = getUserClient(req)!;
    const { data: connection } = await userClient
      .from("integration_connections")
      .select("access_token, refresh_token, expires_at, status")
      .eq("provider", "google_calendar")
      .maybeSingle();

    if (!connection || connection.status !== "connected") {
      return new Response(JSON.stringify({ error: "Google Calendar n'est pas connecté." }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const serviceClient = getServiceClient();

    let accessToken = connection.access_token as string | null;
    const expiresAt = connection.expires_at ? new Date(connection.expires_at as string).getTime() : 0;
    // Refresh a bit before actual expiry, not exactly at it, so a slow
    // request doesn't present an already-expired token to Google.
    const needsRefresh = !accessToken || expiresAt < Date.now() + 60_000;

    if (needsRefresh) {
      if (!connection.refresh_token) {
        // No refresh token on file (shouldn't normally happen given
        // access_type=offline+prompt=consent on first connect, but Google
        // can still revoke externally) — mark the connection as needing
        // reattention rather than failing silently on every future sync.
        await serviceClient.from("integration_connections").update({ status: "error", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "google_calendar");
        return new Response(JSON.stringify({ error: "Connexion Google expirée — reconnecte ton compte." }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const refreshed = await refreshAccessToken(connection.refresh_token as string);
      if (!refreshed) {
        await serviceClient.from("integration_connections").update({ status: "error", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "google_calendar");
        return new Response(JSON.stringify({ error: "Impossible de rafraîchir la connexion Google — reconnecte ton compte." }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      accessToken = refreshed.accessToken;
      await serviceClient
        .from("integration_connections")
        .update({ access_token: accessToken, expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", "google_calendar");
    }

    const now = new Date();
    const timeMin = new Date(now.getTime() - SYNC_WINDOW_PAST_DAYS * 86_400_000).toISOString();
    const timeMax = new Date(now.getTime() + SYNC_WINDOW_FUTURE_DAYS * 86_400_000).toISOString();

    const eventsUrl = new URL(GOOGLE_EVENTS_URL);
    eventsUrl.searchParams.set("timeMin", timeMin);
    eventsUrl.searchParams.set("timeMax", timeMax);
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", String(MAX_EVENTS));

    const eventsRes = await fetch(eventsUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!eventsRes.ok) {
      const errText = await eventsRes.text().catch(() => "");
      console.log(JSON.stringify({ event: "google_calendar_sync_fetch_failed", status: eventsRes.status, body: errText.slice(0, 300) }));
      return new Response(JSON.stringify({ error: "La lecture de Google Calendar a échoué — réessaie." }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const data = await eventsRes.json();
    const items: GoogleEvent[] = data.items ?? [];

    let imported = 0;
    let skipped = 0;
    for (const ev of items) {
      // Declined/cancelled events and all-day events with no real start
      // time aren't useful signal for Clare's own planning features — skip
      // rather than importing a confusing zero-duration or cancelled row.
      if (ev.status === "cancelled" || !ev.id) {
        skipped++;
        continue;
      }
      const startsAt = ev.start?.dateTime ?? ev.start?.date;
      if (!startsAt) {
        skipped++;
        continue;
      }
      const endsAt = ev.end?.dateTime ?? ev.end?.date ?? null;
      const { error: upsertError } = await serviceClient.from("calendar_items").upsert(
        {
          user_id: userId,
          title: ev.summary?.trim() || "(Sans titre)",
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          status: "confirmed",
          source: "google_calendar",
          external_id: ev.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,external_id" }
      );
      if (upsertError) {
        console.log(JSON.stringify({ event: "google_calendar_sync_upsert_failed", error: upsertError.message, external_id: ev.id }));
        skipped++;
      } else {
        imported++;
      }
    }

    await serviceClient
      .from("integration_connections")
      .update({ last_synced_at: new Date().toISOString(), status: "connected", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "google_calendar");

    return new Response(JSON.stringify({ imported, skipped, total: items.length }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
