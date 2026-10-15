import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export interface AdminMetrics {
  user_count: number;
  active_subscriptions: number;
  mrr: { status: string; note: string; active_subscription_count: number };
  canceled_in_period: number;
  period_days: number;
  unprocessed_webhooks: number;
  failed_jobs_in_period: number;
}

/**
 * AdminScreen — Step 7.3, docs/04_ApplicationFlow.md §2.12's Admin
 * paragraph / CLA-FR-022. Intentionally narrow: metrics only, no
 * user-content browsing, no impersonation, no CRM/bulk-messaging.
 * Real enforcement is server-side (admin-metrics checks admin_users
 * before returning anything) — this screen itself is just a display,
 * never the actual security boundary.
 */
export function AdminScreen({
  metrics,
  loading,
  refreshing = false,
  onRefresh,
  error,
  forbidden,
}: {
  metrics: AdminMetrics | null;
  loading: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  error: string;
  forbidden: boolean;
}) {
  if (forbidden) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg p-6 text-center" role="alert" aria-live="assertive">
        <p className="text-4xl">🔒</p>
        <p className="text-sm font-semibold text-text-mid">Accès refusé.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
              Console d'Administration
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Administration & Télémétrie
            </h1>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              aria-label="Actualiser les métriques"
              title="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-6 py-5 lg:mx-auto lg:max-w-[1200px]">
        {loading && !metrics ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <Skeleton width={90} height={10} radius="sm" />
                  <div className="mt-1.5">
                    <Skeleton width={50} height={28} radius="sm" />
                  </div>
                </Card>
              ))}
            </div>
            <Card>
              <Skeleton width={140} height={11} radius="sm" />
              <div className="mt-1.5">
                <Skeleton height={12} radius="sm" />
              </div>
              <div className="mt-1.5">
                <Skeleton width="70%" height={11} radius="sm" />
              </div>
            </Card>
          </>
        ) : error ? (
          <Card role="alert" aria-live="assertive" className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
            <p className="m-0 text-[13px] text-red-text">{error}</p>
          </Card>
        ) : metrics ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <p className="m-0 text-[10px] font-bold uppercase text-meta">Utilisateurs</p>
                <p className="mt-1 text-2xl font-extrabold text-navy">{metrics.user_count}</p>
              </Card>
              <Card>
                <p className="m-0 text-[10px] font-bold uppercase text-meta">Abonnements actifs</p>
                <p className="mt-1 text-2xl font-extrabold text-navy">{metrics.active_subscriptions}</p>
              </Card>
              <Card>
                <p className="m-0 text-[10px] font-bold uppercase text-meta">Annulations ({metrics.period_days}j)</p>
                <p className="mt-1 text-2xl font-extrabold text-navy">{metrics.canceled_in_period}</p>
              </Card>
              <Card>
                <p className="m-0 text-[10px] font-bold uppercase text-meta">Jobs échoués ({metrics.period_days}j)</p>
                <p className="mt-1 text-2xl font-extrabold text-red-text">{metrics.failed_jobs_in_period}</p>
              </Card>
            </div>

            <Card className="bg-gold-soft" style={{ borderColor: "color-mix(in srgb, var(--color-gold) 31%, transparent)" }}>
              <p className="m-0 text-[11px] font-bold uppercase text-gold-text">MRR — TODO_CLIENT_DECISION</p>
              <p className="mt-1.5 text-[12px] text-text-mid" style={{ lineHeight: 1.5 }}>
                {metrics.mrr.note}
              </p>
              <p className="mt-1.5 text-[11px] text-meta">{metrics.mrr.active_subscription_count} abonnement(s) actif(s) sans montant calculé.</p>
            </Card>

            {metrics.unprocessed_webhooks > 0 && (
              <Card className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
                <p className="m-0 text-[13px] font-bold text-red-text">⚠️ {metrics.unprocessed_webhooks} webhook(s) non traité(s)</p>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
