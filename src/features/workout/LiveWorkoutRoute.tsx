import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { fetchLastWorkoutEntry, type JournalEntryRow } from "@/lib/journalRepo";
import { todayKey } from "@/lib/dateUtils";
import { LiveWorkoutScreen } from "./LiveWorkoutScreen";

/**
 * LiveWorkoutRoute — router-level wrapper. Deliberately NOT wrapped in
 * AppShell in router.tsx (unlike every other authenticated screen) — this
 * is a full-screen takeover per 04_ApplicationFlow.md §2.8, same as the
 * Sunday Prep flow, so the persistent nav chrome should not show during an
 * active session.
 */
export function LiveWorkoutRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [lastWorkout, setLastWorkout] = useState<JournalEntryRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchLastWorkoutEntry(user.id, todayKey())
      .then(setLastWorkout)
      .catch(() => setLastWorkout(null))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (authLoading || !user || loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-navy font-ui text-white" role="status" aria-label="Chargement de la séance">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-navy/90 px-6 py-3.5 backdrop-blur-xl pt-[max(0.875rem,env(safe-area-inset-top))]">
          <Skeleton width={70} height={28} variant="navy" radius="md" />
          <Skeleton width={110} height={16} variant="navy" />
          <div className="w-16" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-raised">
            <Skeleton width={140} height={12} variant="navy" className="mb-2" />
            <Skeleton width="90%" height={14} variant="navy" className="mb-2" />
            <Skeleton width="60%" height={14} variant="navy" />
          </div>
          <Skeleton width="100%" height={48} variant="navy" radius="xl" />
        </div>
      </div>
    );
  }

  return <LiveWorkoutScreen userId={user.id} lastWorkout={lastWorkout} onExit={() => navigate("/home")} />;
}
