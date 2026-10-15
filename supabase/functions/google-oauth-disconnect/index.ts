// google-oauth-disconnect — revokes the stored Google token and marks the
// connection disconnected. Runs with the user's real JWT (normal
// verify_jwt, unlike the callback) since this is a direct user action, not
// a provider redirect. Uses the service-role client to write
// integration_connections, same reasoning as google-oauth-callback: the
// client has no insert/update policy on this table (migration 0019), only
// server-side code can change a connection's status.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    // Read-only per-user client just to confirm the row belongs to this
    // caller before touching it with the service client below — the
    // select_own RLS policy still applies here.
    const userClient = getUserClient(req)!;
    const { data: existing } = await userClient
      .from("integration_connections")
      .select("access_token")
      .eq("provider", "google_calendar")
      .maybeSingle();

    // Best-effort revoke with Google — if this fails (token already
    // invalid, network hiccup), still proceed to mark the connection
    // disconnected locally rather than leaving the user stuck unable to
    // disconnect because Google's revoke endpoint had a bad moment.
    if (existing?.access_token) {
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: existing.access_token }),
      }).catch((err) => {
        console.log(JSON.stringify({ event: "google_revoke_failed", error: err instanceof Error ? err.message : String(err) }));
      });
    }

    const serviceClient = getServiceClient();
    const { error } = await serviceClient
      .from("integration_connections")
      .update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "google_calendar");
    if (error) throw error;

    return new Response(JSON.stringify({ disconnected: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
