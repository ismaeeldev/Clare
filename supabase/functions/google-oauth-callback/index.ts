// google-oauth-callback — Google redirects the user's browser straight
// here after consent (a plain GET, no Supabase Authorization header
// possible) with ?code=...&state=.... Deployed with --no-verify-jwt for
// the same reason stripe-webhook/scheduled-agents are: the caller (here,
// the user's own browser following Google's redirect) can never present a
// Supabase-issued JWT. Authenticity instead comes from verifying the
// signed `state` token minted by google-oauth-start (see
// _shared/oauthState.ts) — never from a header.
//
// This is the ONLY place access/refresh tokens are written — always via
// the service-role client, matching 05_DataModel.md §2.15's "stored
// server-side only, never exposed to client" requirement, and matching
// this app's existing "an edge function confirms, the client never
// self-grants" discipline (stripe-webhook is the same shape: only Stripe's
// own confirmation can flip subscriptions to active, not the client).
import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";
import { verifyOAuthState } from "../_shared/oauthState.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function redirectToSettings(appUrl: string, outcome: "connected" | "error"): Response {
  const target = new URL("/settings", appUrl);
  target.searchParams.set("google_calendar", outcome);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const appUrl = Deno.env.get("APP_URL") ?? "https://clare-app-rho.vercel.app";

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    if (googleError) {
      // User declined consent on Google's own screen — not a bug, just a
      // "didn't connect" outcome.
      return redirectToSettings(appUrl, "error");
    }
    if (!code || !state) {
      return redirectToSettings(appUrl, "error");
    }

    const verified = await verifyOAuthState(state);
    if (!verified) {
      // Expired or tampered state — refuse rather than guessing a user id.
      return redirectToSettings(appUrl, "error");
    }
    const { userId } = verified;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToSettings(appUrl, "error");
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "");
      console.log(JSON.stringify({ event: "google_oauth_token_exchange_failed", status: tokenRes.status, body: errText.slice(0, 300) }));
      return redirectToSettings(appUrl, "error");
    }

    const tokens = await tokenRes.json();
    const accessToken: string | undefined = tokens.access_token;
    const refreshToken: string | undefined = tokens.refresh_token;
    const expiresInSeconds: number = tokens.expires_in ?? 3600;

    if (!accessToken) {
      return redirectToSettings(appUrl, "error");
    }

    const client = getServiceClient();
    const { error: upsertError } = await client.from("integration_connections").upsert(
      {
        user_id: userId,
        provider: "google_calendar",
        access_token: accessToken,
        // Google only returns a refresh_token on first consent (see the
        // access_type=offline + prompt=consent comment in
        // google-oauth-start) — a reconnect without one must not clobber
        // an existing refresh_token with null, or sync would silently
        // break once the new access_token expires. Preserve the prior
        // value when Google didn't send a new one.
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
        expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    if (upsertError) {
      console.log(JSON.stringify({ event: "google_oauth_connection_upsert_failed", error: upsertError.message }));
      return redirectToSettings(appUrl, "error");
    }

    return redirectToSettings(appUrl, "connected");
  } catch (err) {
    console.log(JSON.stringify({ event: "google_oauth_callback_error", error: err instanceof Error ? err.message : String(err) }));
    return redirectToSettings(appUrl, "error");
  }
});
