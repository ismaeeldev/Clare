import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — per Step 2.3's Master Prompt task 1. Reads
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Vite's client-exposed env var
 * prefix — not Next.js's NEXT_PUBLIC_ prefix, which import.meta.env doesn't
 * read at all). Points at the clare-dev project (Step 0.3).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
