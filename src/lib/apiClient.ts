/**
 * apiClient — Step 1.2.5 primitive: a generic timeout/retry wrapper.
 * Per docs/03_MasterPrompts.md Step 1.2.5 task 4: every Supabase/Edge
 * Function call from Step 2 onward should go through this wrapper so
 * timeout behavior is consistent everywhere, not reimplemented per screen.
 *
 * This module does NOT instantiate a Supabase client itself (that's Step
 * 2.3's job, in src/lib/supabase.ts) — it wraps any async call (Supabase
 * query, Edge Function fetch, anything) with a default timeout and an
 * optional retry-once-on-timeout policy for READS only. Writes/mutations
 * must never auto-retry, to avoid duplicate actions (per
 * docs/06_AIPromptRegistry.md's idempotency rules and
 * docs/01_ScopeDocument.md CLA-FR-006/007 confirmation-safety requirements).
 */

const DEFAULT_TIMEOUT_MS = 15_000;
// 04_ApplicationFlow.md §3's "Slow network" row: a request taking longer
// than ~2-3s should show a subtle "still working..." indicator, distinct
// from the eventual timeout/error. This is the threshold for that signal.
const SLOW_THRESHOLD_MS = 2_500;

export class ApiTimeoutError extends Error {
  constructor(message = "La requête a pris trop de temps.") {
    super(message);
    this.name = "ApiTimeoutError";
  }
}

interface CallOptions {
  /** Milliseconds before the call is considered timed out. Defaults to 15s. */
  timeoutMs?: number;
  /**
   * Whether a timeout should trigger exactly one retry. Only ever set this
   * true for READ operations — never for a write/mutation, where a retry
   * risks double-committing an action. Defaults to false (no retry).
   */
  retryOnTimeout?: boolean;
  /**
   * Fired once if the call is still pending past SLOW_THRESHOLD_MS —
   * screens use this to show a "still working..." indicator distinct from
   * the eventual timeout/error state. Never fires if the call resolves
   * before the threshold, and is a no-op if it fires after resolution
   * (cleared alongside the timeout timer).
   */
  onSlow?: () => void;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onSlow?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiTimeoutError()), timeoutMs);
    const slowTimer = onSlow ? setTimeout(onSlow, Math.min(SLOW_THRESHOLD_MS, timeoutMs)) : null;
    promise.then(
      (value) => {
        clearTimeout(timer);
        if (slowTimer) clearTimeout(slowTimer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        if (slowTimer) clearTimeout(slowTimer);
        reject(error);
      }
    );
  });
}

/**
 * Wraps an async call factory (a function returning a fresh promise each
 * time, so a retry actually re-issues the call rather than reusing a
 * settled one) with a timeout and optional single retry-on-timeout.
 *
 * Usage:
 *   const data = await apiCall(() => supabase.from("journal_entries").select(), { retryOnTimeout: true });
 *   await apiCall(() => supabase.from("journal_entries").insert(row)); // no retry — this is a write
 */
export async function apiCall<T>(
  fn: () => Promise<T>,
  { timeoutMs = DEFAULT_TIMEOUT_MS, retryOnTimeout = false, onSlow }: CallOptions = {}
): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs, onSlow);
  } catch (error) {
    if (retryOnTimeout && error instanceof ApiTimeoutError) {
      return await withTimeout(fn(), timeoutMs, onSlow);
    }
    throw error;
  }
}
