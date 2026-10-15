import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlement } from "@/hooks/useEntitlement";
import { loadProfile } from "@/lib/profileRepo";
import { fetchEntries, fetchFinanceEntries } from "@/lib/journalRepo";
import { fetchWeekCalendarItems } from "@/lib/agendaRepo";
import { fetchAcceptedPlan } from "@/lib/weeklyPlanRepo";
import { fetchUnreadCount } from "@/lib/notificationsRepo";
import { getWeekStart, getWeekEnd, dateKey } from "@/lib/dateUtils";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { supabase } from "@/lib/supabase";
import { HomeScreen } from "./HomeScreen";
import type { PreparedProposal } from "./PreparedPanel";
import type { AgendaItem, BriefJour, DernierBrief, Finances, JournalEntry, Profile } from "./types";

const ROUTE_MAP: Record<string, string> = {
  agenda: "/agenda",
  journal: "/journal",
  focus: "/focus",
  nutrition: "/nutrition",
  stats: "/stats",
  prep: "/prep-dimanche",
  idees: "/idees",
  settings: "/settings",
  workout: "/workout",
};

/**
 * HomeRoute — router-level wrapper for HomeScreen. Was still on Step 1.3
 * placeholder data (empty profile/journal/agenda/finances) despite
 * profileRepo/journalRepo/agendaRepo all being built and tested since Step
 * 3 — found in Step 6's adversarial review, fixed here. Real data is
 * fetched on mount, mapped from each repo's row shape into HomeScreen's
 * legacy App.jsx-derived prop shapes (types.ts's JournalEntry/AgendaItem/
 * Finances — not the repo's own row types, which is why this route needs
 * explicit mapping rather than passing repo rows straight through).
 */
export function HomeRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { entitled: aiEntitled, loading: entitlementLoading } = useEntitlement();
  const [profile, setProfile] = useState<Profile>({ prenom: "" });
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [finances, setFinances] = useState<Finances>({});
  const [dernierBrief, setDernierBrief] = useState<DernierBrief | undefined>(undefined);
  const [loadingData, setLoadingData] = useState(true);
  const [preparedProposals, setPreparedProposals] = useState<PreparedProposal[]>([]);
  const [loadingPrepared, setLoadingPrepared] = useState(true);
  const [preparedBusyIds, setPreparedBusyIds] = useState<Set<string>>(new Set());
  const [preparedErrors, setPreparedErrors] = useState<Record<string, string>>({});
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;
    // Mounted-ref guard — same pattern as AdminRoute/useEntitlement: if the
    // user navigates away from /home while these fetches are in flight,
    // skip the setState calls below rather than updating an unmounted
    // component.
    let cancelled = false;
    (async () => {
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd(weekStart);
      const weekStartKey = dateKey(weekStart);

      try {
        const [savedProfile, journalRows, calendarItems, financeRows, acceptedPlan, unreadCount] = await Promise.all([
          loadProfile(user.id).catch(() => null),
          fetchEntries(user.id, 30).catch(() => []),
          fetchWeekCalendarItems(user.id, weekStart.toISOString(), weekEnd.toISOString()).catch(() => []),
          fetchFinanceEntries(user.id, 100).catch(() => []),
          fetchAcceptedPlan(user.id, weekStartKey).catch(() => null),
          fetchUnreadCount(user.id).catch(() => 0),
        ]);
        if (cancelled) return;
        setUnreadNotifications(unreadCount);

        if (savedProfile) {
          setProfile({ prenom: savedProfile.form.prenom, objectifCA: savedProfile.form.objectifCA });
        }

        setJournal(
          journalRows.map((j) => ({
            date: j.entry_date,
            sport: j.workout_status === "done" ? "oui" : j.workout_status === "light" ? "léger" : "non",
            energie: j.energy ?? undefined,
            humeur: j.mood ?? undefined,
          }))
        );

        setAgenda(
          calendarItems.map((c) => {
            const d = new Date(c.starts_at);
            return {
              id: c.id,
              // dateKey(d), not d.toISOString().split("T")[0]: the latter
              // converts to UTC before slicing the date, which shifts
              // evening/morning events onto the wrong calendar day for any
              // timezone offset from UTC — the same bug class dateUtils.ts
              // documents and historique already had to fix.
              date: dateKey(d),
              heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              titre: c.title,
              // calendar_items has no category column (docs/05_DataModel.md
              // §2.3) — "rdv" is the generic default TypeDot already
              // supports; a real classification would need a schema change
              // outside this route-wiring fix's scope.
              type: "rdv",
            };
          })
        );

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        // entry_date is a bare YYYY-MM-DD string — compare as local date
        // keys (dateKey), not `new Date(f.entry_date) >= monthStart`: that
        // parses the bare string as UTC midnight against a local Date and
        // shifts entries a day for any timezone west of UTC (same bug
        // class fixed in historique's entry_date handling).
        const monthStartKeyValue = dateKey(monthStart);
        const thisMonthEntries = financeRows.filter((f) => f.entry_date >= monthStartKeyValue);
        const revenus = thisMonthEntries.filter((f) => f.type === "revenue").reduce((sum, f) => sum + f.amount, 0);
        const depenses = thisMonthEntries.filter((f) => f.type === "expense").reduce((sum, f) => sum + f.amount, 0);
        setFinances({
          revenus,
          depenses,
          joursEcoules: now.getDate(),
          joursDansMois: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
        });

        if (acceptedPlan) {
          const jours = (acceptedPlan.plan?.jours as BriefJour[] | undefined) ?? [];
          setDernierBrief({ date: acceptedPlan.created_at, data: { jours } });
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading || !user) return;
    // Separate effect, separate loading state — "Claré has prepared" is a
    // slower AI call (docs/04_ApplicationFlow.md §2.3's own loading-state
    // note distinguishes "(a) contextual cards logic" from "(b) the
    // agent run"), so it must not block the rest of Home's data from
    // rendering while it's in flight.
    let cancelled = false;
    (async () => {
      if (!aiEntitled) {
        if (!cancelled) {
          setPreparedProposals([]);
          setLoadingPrepared(false);
        }
        return;
      }
      try {
        const result = await callEdgeFunction<{ proposals: PreparedProposal[] }>("prepared-agents", {}, 45000);
        if (!cancelled) setPreparedProposals(result.proposals);
      } catch {
        // A failed agent run just means the panel shows its empty state —
        // not a broken Home screen (04_ApplicationFlow.md §2.3's error
        // state: calm retry area, never a blank/broken screen — treating
        // "no proposals" as the safe fallback here since prepared-agents
        // failing is not itself a critical path).
        if (!cancelled) setPreparedProposals([]);
      } finally {
        if (!cancelled) setLoadingPrepared(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, aiEntitled]);

  /**
   * Confirms a prepared-agent proposal: atomically claims the
   * action_proposals row (conditional update, same race-safe pattern as
   * ActionProposalCard.tsx's commitProposal — a double-tap or reload mid-
   * confirm can't double-commit) then commits the real domain write for
   * that agent's action_type before removing it from the panel. A failed
   * commit reverts the claim so the user can retry instead of being stuck
   * on a proposal that silently never applied.
   */
  const handleConfirmPrepared = async (proposal: PreparedProposal) => {
    if (preparedBusyIds.has(proposal.id) || !user) return;
    setPreparedBusyIds((prev) => new Set(prev).add(proposal.id));
    setPreparedErrors((prev) => {
      const next = { ...prev };
      delete next[proposal.id];
      return next;
    });
    try {
      const { data: claimed, error: claimError } = await supabase
        .from("action_proposals")
        .update({ status: "confirmed", resolved_at: new Date().toISOString() })
        .eq("id", proposal.id)
        .eq("status", "proposed")
        .select("id");
      if (claimError) throw claimError;

      if (claimed && claimed.length > 0) {
        try {
          if (proposal.action_type === "create_tasks_batch") {
            const { data: row } = await supabase.from("action_proposals").select("proposed_fields").eq("id", proposal.id).maybeSingle();
            const basedOn = (row?.proposed_fields as { based_on?: { actions?: { title: string; description: string }[] } } | null)?.based_on;
            const actions = basedOn?.actions ?? [];
            if (actions.length > 0) {
              const { error: insertError } = await supabase.from("tasks").insert(
                actions.map((a) => ({
                  user_id: user.id,
                  title: a.title,
                  source: "ai_confirmed",
                  source_proposal_id: proposal.id,
                }))
              );
              if (insertError) throw insertError;
            }
          } else if (proposal.action_type === "create_task") {
            const { error: insertError } = await supabase.from("tasks").insert({
              user_id: user.id,
              title: proposal.title,
              source: "ai_confirmed",
              source_proposal_id: proposal.id,
            });
            if (insertError) throw insertError;
          }
          // acknowledge_meals (meal_agent) has nothing left to write — the
          // meals already exist as real meal_plans rows; confirming here
          // only records that the user acknowledged today's plan.
        } catch (commitErr) {
          await supabase.from("action_proposals").update({ status: "proposed", resolved_at: null }).eq("id", proposal.id).eq("status", "confirmed");
          throw commitErr;
        }
      }

      setPreparedProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    } catch {
      setPreparedErrors((prev) => ({ ...prev, [proposal.id]: "La confirmation a échoué — réessaie." }));
    } finally {
      setPreparedBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return (
    <HomeScreen
      profile={profile}
      journal={journal}
      agenda={agenda}
      finances={finances}
      dernierBrief={dernierBrief}
      streak={0}
      preparedProposals={preparedProposals}
      loadingPrepared={loadingPrepared}
      preparedBusyIds={preparedBusyIds}
      preparedErrors={preparedErrors}
      onConfirmPrepared={handleConfirmPrepared}
      unreadNotifications={unreadNotifications}
      onOpenNotifications={() => navigate("/notifications")}
      onNav={(target) => (target === "chat" ? navigate("/chat") : navigate(ROUTE_MAP[target] ?? "/home"))}
      onChat={(message) => navigate("/chat", { state: { initialMsg: message } })}
      loading={loadingData}
      entitled={aiEntitled}
      entitlementLoading={entitlementLoading}
    />
  );
}
