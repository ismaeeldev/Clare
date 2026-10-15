import { useEffect, useState } from "react";
import { fetchSubscription } from "@/lib/subscriptionsRepo";
import { useAuth } from "./useAuth";

/**
 * useEntitlement — client-side mirror of
 * supabase/functions/_shared/entitlement.ts's ENTITLED_STATUSES check
 * ("active"/"trialing" count as entitled; "past_due"/"canceled"/
 * "incomplete"/no row do not). This is a UX convenience only — per
 * CLA-FR-021 ("a UI-only paywall is explicitly called out as
 * insufficient"), every AI Edge Function still re-checks entitlement
 * server-side regardless of what this hook reports, so a stale or
 * tampered client value can never grant real access. This hook exists so
 * the UI can show the correct locked/unlocked state and upgrade prompts
 * immediately, without waiting for an Edge Function 402 to find out.
 */
export interface EntitlementState {
  /** True once the subscriptions row has been fetched (or confirmed absent) — distinguishes "loading" from "genuinely not entitled". */
  loading: boolean;
  entitled: boolean;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
}

const ENTITLED_STATUSES = new Set(["active", "trialing"]);

interface Fetched {
  userId: string;
  state: EntitlementState;
}

export function useEntitlement(): EntitlementState {
  const { user, loading: authLoading } = useAuth();
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    // Nothing to fetch for a signed-out/still-resolving user — that case
    // is handled below by deriving state from render (user/authLoading)
    // rather than calling setState synchronously in the effect body for
    // it (react-hooks/set-state-in-effect flags that pattern).
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const sub = await fetchSubscription(user.id);
        if (cancelled) return;
        const status = sub?.status ?? null;
        setFetched({ userId: user.id, state: { loading: false, entitled: ENTITLED_STATUSES.has(status ?? ""), status } });
      } catch {
        // Fail closed, matching the server's own entitlement.ts comment:
        // an infra hiccup here must not accidentally show unlocked UI for
        // a paid feature.
        if (!cancelled) setFetched({ userId: user.id, state: { loading: false, entitled: false, status: null } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading) return { loading: true, entitled: false, status: null };
  if (!user) return { loading: false, entitled: false, status: null };
  // fetched.userId !== user.id covers the sign-out/sign-in-as-different-user
  // case without a reset-in-effect: render-time staleness check instead,
  // so a different account can never briefly inherit the previous user's
  // entitled/not-entitled result while this effect's fetch is in flight.
  if (!fetched || fetched.userId !== user.id) return { loading: true, entitled: false, status: null };
  return fetched.state;
}
