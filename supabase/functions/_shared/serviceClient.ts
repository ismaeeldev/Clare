import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Service-role client — bypasses RLS. `nutrition_foods` has no client
 * insert/update policy at all (0005_nutrition.sql: "populated only by an
 * admin import script" or, here, a server-side cache-write from
 * nutrition-lookup) — a per-user client (auth.ts's getUserClient) simply
 * cannot write to it. Only use this for tables/operations that are
 * genuinely meant to bypass row ownership; every other Edge Function in
 * this project uses the per-user client on purpose.
 */
export function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available in Edge Function environment");
  }
  return createClient(supabaseUrl, serviceKey);
}
