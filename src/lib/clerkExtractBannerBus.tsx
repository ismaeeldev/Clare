import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClerkExtractProposal } from "@/features/chat/ClerkExtractBanners";
import { useAuth } from "@/hooks/useAuth";

/**
 * clerkExtractBannerBus — makes newly-confirmed clerk-extract proposals
 * visible to whichever screen the user is on when confirmation happens, not
 * just Chat. 04_ApplicationFlow.md §2.7 describes these banners as
 * cross-cutting ("appear... at top of whichever screen is active"), but
 * ClerkExtractBanners previously only ever rendered inside ChatScreen — if
 * the user navigated away before confirming a proposal, no banner could
 * ever show. This is a plain React context rather than a realtime DB
 * subscription: it only needs to carry proposals this SAME client session
 * just confirmed (ActionProposalCard's onResolved callback), not proposals
 * confirmed on another device/tab.
 */
interface ClerkExtractBannerBusValue {
  confirmedProposals: ClerkExtractProposal[];
  publishConfirmed: (proposal: ClerkExtractProposal) => void;
}

const ClerkExtractBannerBusContext = createContext<ClerkExtractBannerBusValue | null>(null);

export function ClerkExtractBannerBusProvider({ children }: { children: ReactNode }) {
  const [confirmedByUser, setConfirmedByUser] = useState<{ userId: string | null; proposals: ClerkExtractProposal[] }>({
    userId: null,
    proposals: [],
  });
  const seenIdsRef = useRef(new Set<string>());
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // This provider sits above the router (main.jsx), outside any
  // per-route remount — without this, a sign-out followed by a different
  // account signing in in the same tab would keep showing banners
  // confirmed under the previous account. Keyed by userId and derived at
  // render time (same render-time-staleness convention as
  // useEntitlement.ts) rather than a setState-in-effect or a ref mutated
  // during render — a stale userId's proposals are simply treated as
  // empty instead of being cleared via a side effect.
  const confirmedProposals = useMemo(
    () => (confirmedByUser.userId === userId ? confirmedByUser.proposals : []),
    [confirmedByUser, userId]
  );

  const publishConfirmed = useCallback((proposal: ClerkExtractProposal) => {
    if (seenIdsRef.current.has(proposal.id)) return;
    seenIdsRef.current.add(proposal.id);
    setConfirmedByUser((prev) => {
      const prevProposals = prev.userId === userId ? prev.proposals : [];
      return { userId, proposals: [...prevProposals, proposal] };
    });
  }, [userId]);

  // Memoized so a provider re-render (e.g. from a parent state change) with
  // unchanged confirmedProposals/publishConfirmed doesn't hand consumers a
  // brand-new object identity and force them all to re-render regardless.
  const value = useMemo(
    () => ({ confirmedProposals, publishConfirmed }),
    [confirmedProposals, publishConfirmed]
  );

  return (
    <ClerkExtractBannerBusContext.Provider value={value}>
      {children}
    </ClerkExtractBannerBusContext.Provider>
  );
}

export function useClerkExtractBannerBus(): ClerkExtractBannerBusValue {
  const ctx = useContext(ClerkExtractBannerBusContext);
  if (!ctx) throw new Error("useClerkExtractBannerBus must be used within ClerkExtractBannerBusProvider");
  return ctx;
}
