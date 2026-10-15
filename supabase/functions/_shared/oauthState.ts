// Signed, short-lived `state` token for the Google OAuth flow.
//
// google-oauth-callback is a plain browser GET redirect from Google — it
// carries no Supabase Authorization header, so it can't use the normal
// getUserId(req) pattern every other Edge Function in this project uses.
// Instead, google-oauth-start (which DOES run with the user's real JWT)
// mints a signed token embedding the user id + an expiry, and passes it to
// Google as the `state` param; Google echoes it back untouched on
// redirect, and the callback verifies the HMAC signature before trusting
// the embedded user id. This prevents a forged `state` value from
// attributing a Google connection to the wrong user (CSRF on the OAuth
// callback) without needing a server-side session store for this one
// short-lived handshake.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — plenty for a user to complete Google's consent screen, short enough that a leaked/logged value is useless shortly after.

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET");
  if (!secret) {
    throw new Error("GOOGLE_OAUTH_STATE_SECRET not configured — see docs/PAYMENT_SETUP.md-style setup note for Google integration");
  }
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export async function signOAuthState(userId: string): Promise<string> {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifyOAuthState(state: string): Promise<{ userId: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(sigB64), new TextEncoder().encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { userId: payload.uid };
  } catch {
    return null;
  }
}
