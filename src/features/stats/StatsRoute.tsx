import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { loadProfile } from "@/lib/profileRepo";
import { fetchEntries, fetchFinanceEntries } from "@/lib/journalRepo";
import { fetchFocusLog } from "@/lib/focusRepo";
import { fetchTasksByIds } from "@/lib/agendaRepo";
import { dateKey } from "@/lib/dateUtils";
import type { BuildSystemPromptFinances, BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import type { CoherenceFocusLogEntry, CoherenceJournalEntry } from "@/lib/calculerCoherence";
import { StatsScreen } from "./StatsScreen";

/**
 * StatsRoute — router-level wrapper for StatsScreen. Was still on Step 1.3
 * placeholder data despite the repo layers being built and tested since
 * Step 3 — found in Step 6's adversarial review, fixed here alongside
 * HomeRoute and PrepDimancheRoute (the same gap existed in all three).
 */
export function StatsRoute() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BuildSystemPromptProfile>({ prenom: "" });
  const [journal, setJournal] = useState<CoherenceJournalEntry[]>([]);
  const [finances, setFinances] = useState<BuildSystemPromptFinances>({});
  const [focusLog, setFocusLog] = useState<CoherenceFocusLogEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadData = async (isManual = false) => {
    if (!user) return;
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoadingData(true);
    }
    setLoadError("");
    try {
      // No per-promise .catch(() => []) here on purpose: swallowing each
      // fetch's error individually means a real outage used to render a
      // plausible-looking but silently-wrong all-zero dashboard with no
      // error UI at all (same silent-failure class fixed in
      // lieux/notifications/routine/settings). A failure in any one of
      // these now surfaces the visible error state below instead.
      const [savedProfile, journalRows, financeRows, focusRows] = await Promise.all([
        loadProfile(user.id),
        fetchEntries(user.id, 30),
        fetchFinanceEntries(user.id, 100),
        fetchFocusLog(user.id),
      ]);

      const linkedTaskIds = [...new Set(focusRows.map((f) => f.linked_task_id).filter((id): id is string => !!id))];
      const tasks = await fetchTasksByIds(linkedTaskIds);
      const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));
      setFocusLog(
        focusRows.map((f) => ({
          date: (f.started_at ?? f.created_at).split("T")[0],
          projet: f.linked_task_id ? taskTitleById.get(f.linked_task_id) : undefined,
          duree: f.duration_seconds ? Math.round(f.duration_seconds / 60) : undefined,
        }))
      );

      if (savedProfile) {
        setProfile({ prenom: savedProfile.form.prenom, objectifCA: savedProfile.form.objectifCA });
      }

      setJournal(
        journalRows.map((j) => ({
          date: j.entry_date,
          energie: j.energy ?? undefined,
          humeur: j.mood ?? undefined,
          sport: j.workout_status ?? undefined,
          revenus: j.revenue ?? undefined,
          depenses: j.expenses ?? undefined,
          texte: j.text_content ?? undefined,
          projet: j.project_touched ?? undefined,
        }))
      );

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      // f.entry_date is a bare YYYY-MM-DD local calendar-date string —
      // compare as dateKey strings, not `new Date(f.entry_date) >=
      // monthStart`, which parses the bare string as UTC midnight and can
      // silently drop/misclassify entries near the month boundary.
      const monthStartKey = dateKey(monthStart);
      const thisMonthEntries = financeRows.filter((f) => f.entry_date >= monthStartKey);
      setFinances({
        revenus: thisMonthEntries.filter((f) => f.type === "revenue").reduce((sum, f) => sum + f.amount, 0),
        depenses: thisMonthEntries.filter((f) => f.type === "expense").reduce((sum, f) => sum + f.amount, 0),
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Impossible de charger tes statistiques.");
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      await loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return (
    <StatsScreen
      profile={profile}
      journal={journal}
      finances={finances}
      focusLog={focusLog}
      loading={loadingData}
      refreshing={refreshing}
      loadError={loadError}
      onRetryLoad={() => loadData(false)}
      onRefresh={() => loadData(true)}
    />
  );
}
