// google-oauth-start — begins the Google Calendar connect flow.
// Trigger: user taps "Connecter" on Settings' Google Calendar card.
// Returns the Google consent-screen URL for the client to redirect the
// browser to (window.location.href = url, same pattern as
// stripe-checkout's session.url). Never touches integration_connections
// itself — that only happens in google-oauth-callback, once Google has
// actually confirmed the grant (same "proposal vs. confirmed" discipline
// CLA-FR-021/006 already apply elsewhere in this app: a client call here
// must never be able to mark a connection "connected" on its own).
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId } from "../_shared/auth.ts";
import { signOAuthState } from "../_shared/oauthState.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "Google OAuth not configured on the server" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const state = await signOAuthState(userId);

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    // Read-only scope only — this is a one-way sync (Google → Clare's own
    // agenda), per the feature's current scope. Requesting write access
    // would need a separate re-consent and is explicitly out of scope for
    // this pass.
    url.searchParams.set("scope", CALENDAR_READONLY_SCOPE);
    // offline access + prompt=consent: without both, Google only returns a
    // refresh_token on the user's FIRST ever consent for this app — a
    // disconnect/reconnect cycle would silently stop returning one on
    // subsequent connects, breaking sync after the first access_token
    // expires with no way to refresh it.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: url.toString() }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
