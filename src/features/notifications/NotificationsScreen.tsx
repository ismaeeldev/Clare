import { useState } from "react";
import { CheckCheck, RefreshCw, Sparkles } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import type { NotificationRow } from "@/lib/notificationsRepo";

/**
 * NotificationsSkeleton — Sleek shape-matched placeholder
 */
export function NotificationsSkeleton() {
  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement des notifications">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/80 bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-between">
          <div className="flex items-center gap-3">
            <SkeletonBlock width={36} height={36} radius="xl" />
            <div>
              <SkeletonBlock width={140} height={20} radius="md" className="mb-1" />
              <SkeletonBlock width={80} height={12} radius="sm" />
            </div>
          </div>
          <SkeletonBlock width={80} height={32} radius="xl" />
        </div>
      </div>

      {/* List Skeleton */}
      <div className="mx-auto flex max-w-[900px] flex-col gap-3 px-5 py-6 sm:px-6">
        <div className="flex gap-2 mb-2">
          <SkeletonBlock width={70} height={30} radius="full" />
          <SkeletonBlock width={90} height={30} radius="full" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3.5 rounded-2xl border border-border/80 bg-white p-4.5 shadow-sm">
            <SkeletonBlock width={40} height={40} radius="xl" />
            <div className="flex-1">
              <SkeletonBlock width="50%" height={15} radius="sm" className="mb-2" />
              <SkeletonBlock width="85%" height={13} radius="sm" className="mb-2" />
              <SkeletonBlock width={60} height={10} radius="sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPE_CONFIG: Record<string, { icon: string; bg: string; color: string; tag: string }> = {
  weekly_prep: {
    icon: "🗓️",
    bg: "bg-gold-soft",
    color: "text-gold-text",
    tag: "Organisation",
  },
  upcoming_reminder: {
    icon: "⏰",
    bg: "bg-purple-soft",
    color: "text-purple-text",
    tag: "Rappel",
  },
  low_energy_suggestion: {
    icon: "⚡",
    bg: "bg-amber-soft",
    color: "text-amber-text",
    tag: "Conseil Énergie",
  },
  meal_alert: {
    icon: "🍽️",
    bg: "bg-green-soft",
    color: "text-green-text",
    tag: "Nutrition",
  },
};

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `Il y a ${diffD} j`;
}

/**
 * NotificationsScreen — Sleek, luxury notifications center
 */
export function NotificationsScreen({
  notifications,
  onBack,
  onNotificationTap,
  onMarkAllRead,
  loading = false,
  refreshing = false,
  onRefresh,
  error = "",
}: {
  notifications: NotificationRow[];
  onBack: () => void;
  onNotificationTap: (n: NotificationRow) => void;
  onMarkAllRead: () => void;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  error?: string;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasUnread = unreadCount > 0;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    return true;
  });

  if (loading && notifications.length === 0) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {/* 1. Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[900px] items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton onClick={onBack} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="m-0 font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
                  Notifications
                </h1>
                {hasUnread && (
                  <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold-soft px-2.5 py-0.5 text-[11px] font-extrabold text-gold-text">
                    {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-meta">
                {refreshing ? "Actualisation en cours..." : "Vos alertes, rappels et synthèses Claré"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading || refreshing}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer"
                aria-label="Actualiser les notifications"
                title="Actualiser"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin text-gold" : "text-navy"} />
              </button>
            )}
            {hasUnread && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold-soft px-3 py-1.5 text-xs font-bold text-gold-text transition-all duration-180 hover:bg-gold hover:text-navy cursor-pointer"
              >
                <CheckCheck size={14} />
                <span>Tout marquer lu</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Notifications Content */}
      <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-5 py-6 sm:px-6">
        {error && <InlineError message={error} />}

        {/* Filter Pills */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-navy text-white shadow-sm"
                  : "bg-white border border-border text-meta hover:text-navy"
              }`}
            >
              Toutes ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                filter === "unread"
                  ? "bg-gold text-navy shadow-sm"
                  : "bg-white border border-border text-meta hover:text-navy"
              }`}
            >
              Non lues ({unreadCount})
            </button>
          </div>
          <span className="text-[11px] font-semibold text-meta flex items-center gap-1">
            <Sparkles size={12} className="text-gold" />
            Mises à jour instantanées
          </span>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="🔔"
              title={filter === "unread" ? "Aucune notification non lue" : "Aucune notification"}
              description="Vous êtes parfaitement à jour — aucun rappel en attente pour le moment."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredNotifications.map((n) => {
              const config = TYPE_CONFIG[n.type ?? ""] || {
                icon: "🔔",
                bg: "bg-navy-100",
                color: "text-navy",
                tag: "Général",
              };

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNotificationTap(n)}
                  aria-label={`${n.read ? "" : "Non lu. "}${n.title ?? ""}${n.body ? `. ${n.body}` : ""}`}
                  className={`group relative flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-floating cursor-pointer ${
                    n.read
                      ? "border-border/80 bg-white shadow-[0_2px_8px_rgba(26,31,60,0.03)]"
                      : "border-gold/40 bg-gradient-to-r from-gold-soft/40 via-white to-white shadow-raised"
                  }`}
                >
                  {/* Unread indicator line */}
                  {!n.read && (
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-gold shadow-gold-glow" />
                  )}

                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-xs transition-transform duration-200 group-hover:scale-105 ${config.bg}`}
                  >
                    {config.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-meta">
                          {config.tag}
                        </span>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-gold shadow-gold-glow" />
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-meta">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>

                    <p className="mt-0.5 font-display text-[14px] font-extrabold text-navy">
                      {n.title}
                    </p>

                    {n.body && (
                      <p className="mt-1 text-body-sm text-text-mid leading-relaxed">
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
