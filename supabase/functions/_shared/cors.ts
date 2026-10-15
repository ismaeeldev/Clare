// Shared CORS headers for every Edge Function in this project. Allows the
// app's own origin(s) to call these functions from the browser (Supabase
// Edge Functions are public HTTP endpoints by default, gated by the
// caller's JWT — not by origin — but a CORS preflight still needs a
// response or the browser blocks the request before it's even sent).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
