import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useEntitlement } from "@/hooks/useEntitlement";

/**
 * PremiumRoute — wraps a screen that has NO standalone free value (its
 * entire purpose is an AI feature already gated server-side, e.g. Chat,
 * Prep Dimanche). Unlike those two, most screens mix free content with one
 * AI action — those stay reachable and instead gate just the AI button
 * inline (see UpgradePrompt), since fully locking the whole tab would
 * block real free functionality that has nothing to do with the
 * subscription.
 *
 * This is a UX convenience, not the real security boundary — per
 * CLA-FR-021, every AI Edge Function already re-checks entitlement
 * server-side regardless of what this component shows (same contract as
 * useEntitlement.ts). A user who reaches this route by a stale client
 * state or a direct link still can't actually call the AI endpoint
 * without a real subscription — this component just avoids making them
 * find that out by waiting on a 402 after clicking something inside a
 * screen that was never going to work for them.
 */
export function PremiumRoute({ children }: { children: ReactNode }) {
  const { loading, entitled } = useEntitlement();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6">
        <Skeleton width={220} height={20} />
        <Skeleton width={160} height={16} />
      </div>
    );
  }

  if (!entitled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-soft text-gold-text">
          <Lock size={28} />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-navy">Fonctionnalité Premium</h1>
          <p className="mt-2 max-w-xs text-body-sm text-text-mid" style={{ lineHeight: 1.6 }}>
            Cette fonctionnalité nécessite un abonnement Claré actif.
          </p>
          <p className="mt-1 text-body-sm font-extrabold text-navy">19,90 € / mois · sans engagement</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/billing")}>
          S'abonner maintenant →
        </Button>
        <button type="button" onClick={() => navigate("/home")} className="text-body-sm font-medium text-text-mid hover:text-navy hover:underline">
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
