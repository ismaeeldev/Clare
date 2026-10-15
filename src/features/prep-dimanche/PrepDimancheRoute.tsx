import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { loadProfile } from "@/lib/profileRepo";
import { fetchEntries, fetchFinanceEntries } from "@/lib/journalRepo";
import { fetchWeekCalendarItems } from "@/lib/agendaRepo";
import { getWeekStart, getWeekEnd, dateKey } from "@/lib/dateUtils";
import type { BuildSystemPromptFinances, BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import type { CoherenceJournalEntry } from "@/lib/calculerCoherence";
import { PrepDimancheScreen } from "./PrepDimancheScreen";
import type { PrepDimancheAgendaItem } from "./types";

/**
 * PrepDimancheRoute — router-level wrapper for PrepDimancheScreen. Was
 * still on Step 1.3 placeholder data (empty profile/journal/agenda/
 * finances) despite the repo layers being built and tested since Step 3 —
 * found in Step 6's adversarial review, fixed here alongside HomeRoute and
 * StatsRoute (the same gap existed in all three). `onBriefSaved` stays a
 * no-op — the accepted-plan persistence itself now happens inside
 * PrepDimancheScreen's own accept flow (weeklyPlanRepo.ts), this route
 * only supplies the real input context for generation.
 */
export function PrepDimancheRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BuildSystemPromptProfile>({ prenom: "" });
  const [journal, setJournal] = useState<CoherenceJournalEntry[]>([]);
  const [agenda, setAgenda] = useState<PrepDimancheAgendaItem[]>([]);
  const [finances, setFinances] = useState<BuildSystemPromptFinances>({});
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const weekStart = getWeekStart();
      // 2 weeks ahead — PrepDimancheScreen's own agendaSemaine filter
      // (genBrief) already narrows this down to a -1..+8 day window itself,
      // this just needs to comfortably cover that range.
      const weekEnd = getWeekEnd(getWeekStart(1));

      try {
        const [savedProfile, journalRows, calendarItems, financeRows] = await Promise.all([
          loadProfile(user.id).catch(() => null),
          fetchEntries(user.id, 30).catch(() => []),
          fetchWeekCalendarItems(user.id, weekStart.toISOString(), weekEnd.toISOString()).catch(() => []),
          fetchFinanceEntries(user.id, 100).catch(() => []),
        ]);

        if (savedProfile) {
          setProfile({
            prenom: savedProfile.form.prenom,
            alimentation: savedProfile.form.alimentation,
            equipements: savedProfile.equipements.join(", "),
            tempsCuisine: savedProfile.form.tempsCuisine,
            sport: savedProfile.form.objectifSport,
          });
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

        setAgenda(
          calendarItems.map((c, i) => {
            const d = new Date(c.starts_at);
            return {
              id: i,
              date: dateKey(d),
              heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              titre: c.title,
              type: "rdv",
            };
          })
        );

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthEntries = financeRows.filter((f) => new Date(f.entry_date) >= monthStart);
        setFinances({
          revenus: thisMonthEntries.filter((f) => f.type === "revenue").reduce((sum, f) => sum + f.amount, 0),
          depenses: thisMonthEntries.filter((f) => f.type === "expense").reduce((sum, f) => sum + f.amount, 0),
        });
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return (
    <PrepDimancheScreen
      userId={user.id}
      profile={profile}
      journal={journal}
      agenda={agenda}
      finances={finances}
      focusLog={[]}
      onBack={() => navigate("/home")}
      onBriefSaved={() => {}}
      loading={loadingData}
    />
  );
}
