import {
  CreditCard,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  AlertTriangle
} from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SubscriptionRow } from "@/lib/subscriptionsRepo";

const STATUS_LABEL: Record<string, string> = {
  active: "Abonnement Actif",
  trialing: "Essai gratuit en cours",
  past_due: "Paiement en attente",
  canceled: "Annulé",
  incomplete: "Incomplet",
};

const FEATURES = [
  "Accès illimité à l'IA Claré & conseils personnalisés",
  "Planification hebdomadaire des repas & liste de courses intelligente",
  "Suivi de l'énergie, de l'humeur et du journal quotidien",
  "Vide-tête automatique & classification instantanée des idées",
  "Gestion des finances & calcul de cohérence du projet",
  "Export complet de tes données à tout moment",
];

export function BillingScreen({
  subscription,
  loading,
  confirming,
  confirmationTimedOut,
  checkoutLoading,
  portalLoading,
  checkoutError,
  portalError,
  onCheckout,
  onManage,
  onBack,
}: {
  subscription: SubscriptionRow | null;
  loading: boolean;
  confirming: boolean;
  confirmationTimedOut: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  checkoutError: string;
  portalError: string;
  onCheckout: () => void;
  onManage: () => void;
  onBack: () => void;
}) {
  const status = subscription?.status ?? null;
  const isEntitled = status === "active" || status === "trialing";
  // past_due/incomplete already have a live Stripe subscription (just
  // one needing a payment fix) — routing them through "S'abonner" would
  // hit stripe-checkout again, which only blocks a SECOND session for
  // active/trialing (see stripe-checkout/index.ts's checkEntitlement
  // call), so it would happily create a second subscription on the same
  // customer and double-bill them. Send them to the portal instead,
  // same place the past_due alert card's own CTA already points.
  const hasExistingSubscription = status === "past_due" || status === "incomplete";

  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {/* Top Header */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
              Facturation & Claré Premium
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Abonnement
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-5 py-6 sm:px-6">
        {/* Payment Confirmation State */}
        {confirming && (
          <Card className="mb-6 border border-gold/30 bg-gold-soft p-5">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              <div>
                <p className="text-sm font-bold text-navy">Confirmation de paiement en cours...</p>
                <p className="text-xs text-text-mid mt-0.5">
                  Stripe valide ta transaction. Ton statut sera mis à jour dans quelques secondes.
                </p>
              </div>
            </div>
          </Card>
        )}

        {confirmationTimedOut && !confirming && (
          <Card className="mb-6 border border-gold/30 bg-gold-soft p-5">
            <p className="text-sm font-bold text-navy">
              Paiement reçu mais en cours de finalisation
            </p>
            <p className="text-xs text-text-mid mt-1">
              La confirmation prend un peu plus de temps. Ton compte sera activé dès réception du signal Stripe.
            </p>
          </Card>
        )}

        {loading ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Chargement de l'abonnement">
            <div className="h-44 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Status Alert if Past Due */}
            {status === "past_due" && (
              <Card className="border border-red-200 bg-red-50/70 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-text">Problème de prélèvement</p>
                    <p className="text-xs text-text-mid mt-1">
                      Ta dernière tentative de paiement a échoué. Mets à jour ta carte pour éviter une interruption d'accès.
                    </p>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={onManage} 
                      disabled={portalLoading} 
                      className="mt-3 font-bold cursor-pointer"
                    >
                      {portalLoading ? "Chargement..." : "Mettre à jour le moyen de paiement →"}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Current Plan Card */}
            <Card className="rounded-2xl border border-border/80 bg-white p-6 shadow-[0_2px_12px_rgba(26,31,60,0.04)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isEntitled ? "bg-navy text-gold" : "bg-slate-100 text-meta"}`}>
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-extrabold text-navy">
                        {isEntitled ? "Plan Claré Membre" : "Formule Standard"}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                          isEntitled
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-meta"
                        }`}
                      >
                        {status ? (STATUS_LABEL[status] ?? status) : "Inactif"}
                      </span>
                    </div>
                    {subscription?.current_period_end ? (
                      <p className="text-xs text-meta mt-1 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {status === "canceled" ? "Accès valable jusqu'au" : "Prochain renouvellement le"}{" "}
                        {new Date(subscription.current_period_end).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    ) : (
                      <p className="text-xs text-meta mt-1">
                        <span className="font-extrabold text-navy">19,90&nbsp;€</span> / mois · sans engagement
                      </p>
                    )}
                  </div>
                </div>

                {isEntitled || hasExistingSubscription ? (
                  <Button
                    variant="secondary"
                    onClick={onManage}
                    disabled={portalLoading}
                    className="font-bold cursor-pointer shrink-0"
                  >
                    {portalLoading ? "Ouverture..." : "Gérer l'abonnement Stripe →"}
                  </Button>
                ) : (
                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <Button
                      variant="accent"
                      size="lg"
                      onClick={onCheckout}
                      disabled={checkoutLoading}
                      className="font-bold cursor-pointer"
                    >
                      {checkoutLoading ? "Ouverture Stripe..." : "S'abonner — 19,90 € / mois →"}
                    </Button>
                  </div>
                )}
              </div>

              {portalError && <p className="mt-3 text-xs text-red-text">{portalError}</p>}
              {checkoutError && <p className="mt-3 text-xs text-red-text">{checkoutError}</p>}

              {/* What is included */}
              <div className="pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-meta mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-gold" />
                  Ce qui est inclus dans ton abonnement :
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {FEATURES.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-navy">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      <span className="leading-snug">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Trust and Security Footnote */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-border/70 bg-slate-50/70 p-4 text-xs text-meta">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-navy" />
                <span>Paiements sécurisés traités par Stripe · Chiffrement 256-bit</span>
              </div>
              <span>Sans engagement, résiliable à tout moment en 1 clic.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

