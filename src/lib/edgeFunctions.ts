import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiCall, ApiTimeoutError } from "@/lib/apiClient";

/**
 * Shared client for calling this project's Supabase Edge Functions
 * (supabase/functions/*) — Step 4.2's real server-side AI pipeline,
 * replacing every screen's old client-side askClare/api-claude.js call.
 * Uses supabase.functions.invoke, which automatically attaches the current
 * user's session JWT — the Edge Function's own auth.ts then validates it
 * server-side per-request; there is no client-supplied system prompt or
 * max_tokens override anywhere in this path (CLA-FR-005).
 *
 * Routed through apiClient.ts's timeout wrapper (no retry — every one of
 * these functions can have side effects, e.g. chat-respond writes
 * messages/action_proposals rows, so a retried call risks a duplicate).
 */
export async function callEdgeFunction<T>(name: string, body: Record<string, unknown>, timeoutMs = 45000, onSlow?: () => void): Promise<T> {
  const { data, error } = await apiCall(() => Promise.resolve(supabase.functions.invoke(name, { body })), { timeoutMs, onSlow });
  if (error) {
    // On a non-2xx response, supabase.functions.invoke's own error.message
    // is just a generic "Edge Function returned a non-2xx status code" —
    // it does NOT read the function's actual JSON error body. The real
    // body (e.g. {"error": "Unauthorized"}) is only reachable via
    // error.context, which is the raw Response object. Without this, every
    // caller (AdminRoute's forbidden-detection included) only ever sees
    // the generic SDK message, never the function's real error reason.
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || `Erreur lors de l'appel à ${name}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export { ApiTimeoutError };
