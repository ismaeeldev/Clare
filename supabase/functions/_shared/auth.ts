import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Creates a Supabase client scoped to the calling user's own JWT (extracted
 * from the request's Authorization header) — reads/writes through this
 * client are still subject to RLS, so an Edge Function can never
 * accidentally act as a different user or bypass row ownership just by
 * virtue of running server-side. Returns null if the request has no valid
 * bearer token.
 */
export function getUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY not available in Edge Function environment");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export async function getUserId(req: Request): Promise<string | null> {
  const client = getUserClient(req);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
