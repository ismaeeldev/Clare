import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { fetchAcceptedPlan, acceptWeeklyPlan } from "@/lib/weeklyPlanRepo";
import { isProposalExpired, expireProposal } from "@/lib/chatRepo";

/**
 * Marks a validation failure whose message is safe to show the user
 * verbatim (hand-written, French, no internal detail) — as opposed to a
 * raw Supabase/Postgres error, which must never reach the UI directly.
 */
class ProposalValidationError extends Error {}

/**
 * ActionProposalCard — Step 4.3, per docs/02_ThemeGuideline.md §6.5:
 * "distinct bordered card (gold 1.5px border, gold-soft bg) with clear
 * 'Suggestion — not yet applied' label... Confirm (gold) / Dismiss (ghost)
 * buttons. This visual distinction between 'AI said' vs 'AI did' is a hard
 * product requirement (CLA-FR-006)."
 *
 * Confirm writes the proposed_fields into the correct domain table
 * (tasks/calendar_items/finance_entries per action_type) and sets
 * action_proposals.status='confirmed', keyed on idempotency_key so
 * re-tapping an already-confirmed proposal can't create a duplicate row
 * (Step 4.3 task 3's idempotency requirement, tested in 4.6.4).
 */
export type ActionType = "create_task" | "create_calendar_item" | "create_finance_entry" | "replan_week" | "create_idea" | "update_journal_state";

export interface ActionProposalCardProps {
  proposalId: string;
  actionType: ActionType;
  proposedFields: Record<string, unknown>;
  explanation: string;
  status: "proposed" | "confirmed" | "dismissed" | "expired";
  /** ISO timestamp the proposal was created — used to detect staleness (04_ApplicationFlow.md §2.4's "expired" state). */
  createdAt?: string;
  onResolved?: (status: "confirmed" | "dismissed") => void;
}

const ACTION_LABELS: Record<ActionType, string> = {
  create_task: "Nouvelle tâche",
  create_calendar_item: "Nouveau rendez-vous",
  create_finance_entry: "Nouvelle entrée financière",
  replan_week: "Réorganisation de la semaine",
  create_idea: "Nouvelle idée",
  update_journal_state: "Mise à jour du journal",
};

// Formats a Date's LOCAL calendar date as YYYY-MM-DD — never
// toISOString(), which always serializes to UTC regardless of how the
// Date was constructed. Europe/Paris is UTC+1/+2, so for the ~1-2 hours
// after local midnight the UTC date is still "yesterday"; using
// toISOString() here for a "today"/"tomorrow" resolution would silently
// date a confirmed entry a day off during that window — the same class
// of bug a client report flagged for AI-proposed appointment dates
// resolving against the wrong "today" in the first place.
function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function resolveDate(value: unknown): string {
  // A missing/non-string date (malformed model output) previously fell
  // back to new Date().toISOString() — a full UTC timestamp, not a
  // YYYY-MM-DD date, and UTC-based for the same reason this function's
  // other two branches were just fixed. Falling back to today's correct
  // local date here is both more consistent with the rest of this
  // function and avoids handing a timestamp string to a date column.
  const now = new Date();
  if (typeof value !== "string") return formatLocalDate(now);
  if (value === "tomorrow" || value === "demain") {
    now.setDate(now.getDate() + 1);
    return formatLocalDate(now);
  }
  if (value === "today" || value === "aujourd'hui") {
    // Resolved explicitly here rather than passed through as the literal
    // string "today" for Postgres's date-cast parser to interpret —
    // Postgres's special 'today' value is evaluated in the DATABASE
    // server's timezone (UTC on this project), not the user's, which is
    // the same UTC-vs-Paris mismatch formatLocalDate's comment explains.
    return formatLocalDate(now);
  }
  // Already an ISO-ish date string — trust it as-is.
  return value;
}

/**
 * Commits proposed_fields into the correct domain table. This is the ONLY
 * place in the app that writes a domain row on the AI's behalf — always
 * gated behind this explicit user tap, never automatic.
 */
async function commitProposal(actionType: ActionType, fields: Record<string, unknown>, userId: string, proposalId: string): Promise<void> {
  switch (actionType) {
    case "create_task": {
      const title = String(fields.title ?? "").trim();
      if (!title) throw new ProposalValidationError("La tâche proposée n'a pas de titre.");
      const { error } = await supabase.from("tasks").insert({
        user_id: userId,
        title,
        due_date: fields.due_date ? resolveDate(fields.due_date) : null,
        source: "ai_confirmed",
        source_proposal_id: proposalId,
      });
      if (error) throw error;
      return;
    }
    case "create_calendar_item": {
      const date = resolveDate(fields.date);
      const time = typeof fields.time === "string" ? fields.time : "09:00";
      const startsAt = new Date(`${date}T${time}`);
      if (Number.isNaN(startsAt.getTime())) throw new ProposalValidationError("Date ou heure de rendez-vous invalide.");
      const title = String(fields.title ?? "").trim();
      if (!title) throw new ProposalValidationError("Le rendez-vous proposé n'a pas de titre.");
      const { error } = await supabase.from("calendar_items").insert({
        user_id: userId,
        title,
        starts_at: startsAt.toISOString(),
        source: "ai_confirmed",
        source_proposal_id: proposalId,
      });
      if (error) throw error;
      return;
    }
    case "create_finance_entry": {
      // Defense-in-depth: chat-respond's prompt tells the model to use
      // exactly "revenue"/"expense", but a model can still drift (observed
      // in testing: "income" instead of "revenue") since proposed_fields'
      // JSON schema is a free-form object, not per-key enum-constrained
      // (Anthropic tool-use doesn't cleanly support conditional/per-variant
      // schemas here). Normalize recognized synonyms for "expense" instead
      // of defaulting everything-not-literally-"expense" to "revenue",
      // which would silently misclassify a genuine expense the model
      // phrased differently.
      const expenseSynonyms = new Set(["expense", "depense", "dépense", "outcome"]);
      const type = expenseSynonyms.has(String(fields.type).toLowerCase()) ? "expense" : "revenue";
      const { error } = await supabase.from("finance_entries").insert({
        user_id: userId,
        entry_date: resolveDate(fields.date),
        amount: Number(fields.amount) || 0,
        type,
        category: typeof fields.category === "string" ? fields.category : null,
        source: "ai_confirmed",
        source_proposal_id: proposalId,
      });
      if (error) throw error;
      return;
    }
    case "replan_week": {
      // disruption-replan (Step 6) never writes weekly_plans itself — this
      // confirm step is where the diff actually gets applied, same
      // proposal→confirm→commit contract as every other action_type here.
      // Never update the currently-accepted row in place: fetch it, apply
      // the diff onto a copy of its `jours`, then insert as a new accepted
      // version (weeklyPlanRepo.acceptWeeklyPlan already implements the
      // required supersede-then-insert sequence, per 05_DataModel.md §2.4's
      // "never overwrite an accepted plan" rule).
      //
      // The diff's moved/added/dropped items are Claude-produced free-form
      // objects (registry §2.3 deliberately leaves their exact shape
      // unspecified) — live testing this session showed Claude producing
      // FIELD-level entries (e.g. {jour:"Mercredi", champ:"tache_1",
      // valeur:"..."}), not whole-DAY entries. An earlier version of this
      // function assumed whole-day drops/moves keyed only by `jour`, which
      // would have deleted an entire day (including its unrelated sport/
      // meal plan) just because ONE field on it changed — exactly the
      // over-aggressive edit the function's own system prompt explicitly
      // forbids ("Ne modifie QUE ce qui est directement affecté"). Handle
      // both shapes: if an item has a `champ`, patch only that field on the
      // matching day; if it has no `champ` (a genuine whole-day entry),
      // apply it at the day level.
      const weekStart = typeof fields.week_start === "string" ? fields.week_start : null;
      type DiffItem = { jour?: string; champ?: string; valeur?: unknown; [key: string]: unknown };
      const diff = fields.diff as { moved?: DiffItem[]; added?: DiffItem[]; dropped?: DiffItem[] } | undefined;
      if (!weekStart || !diff) throw new ProposalValidationError("Proposition de réorganisation incomplète.");

      const current = await fetchAcceptedPlan(userId, weekStart);
      if (!current) {
        // The accepted plan this diff was computed against no longer
        // exists (e.g. dismissed/replaced between proposal and confirm) —
        // nothing safe to apply the diff onto.
        throw new ProposalValidationError("Le plan accepté pour cette semaine n'existe plus — réorganisation impossible.");
      }

      const existingJours = (current.plan?.jours as Record<string, unknown>[] | undefined) ?? [];
      const wholeDayDrops = new Set((diff.dropped ?? []).filter((d) => d.jour && !d.champ).map((d) => d.jour));
      const fieldDrops = (diff.dropped ?? []).filter((d) => d.jour && d.champ);
      const wholeDayMoves = new Map((diff.moved ?? []).filter((m) => m.jour && !m.champ).map((m) => [m.jour, m]));
      const fieldMoves = (diff.moved ?? []).filter((m) => m.jour && m.champ);

      let mergedJours = existingJours
        .filter((j) => !wholeDayDrops.has(j.jour as string))
        .map((j) => wholeDayMoves.get(j.jour as string) ?? j);

      for (const patch of [...fieldDrops, ...fieldMoves]) {
        if (!patch.champ) continue;
        const champ = patch.champ;
        mergedJours = mergedJours.map((j) => (j.jour === patch.jour ? { ...j, [champ]: fieldDrops.includes(patch) ? null : patch.valeur } : j));
      }

      for (const added of diff.added ?? []) {
        if (!added.jour) continue;
        if (added.champ) {
          // Field-level "added" on an existing day (e.g. a new alert/note)
          // — patch in place rather than pushing a second row for the
          // same day.
          const champ = added.champ;
          const existingDay = mergedJours.find((j) => j.jour === added.jour);
          if (existingDay) {
            mergedJours = mergedJours.map((j) => (j.jour === added.jour ? { ...j, [champ]: added.valeur } : j));
            continue;
          }
        }
        mergedJours.push(added as Record<string, unknown>);
      }

      await acceptWeeklyPlan(userId, weekStart, current.summary ?? {}, { jours: mergedJours }, "claude-sonnet-4-5");
      return;
    }
    case "create_idea": {
      const { error } = await supabase.from("ideas").insert({
        user_id: userId,
        text: String(fields.text ?? ""),
        category: fields.category === "pro" ? "pro" : "perso",
        source: "brain_dump",
      });
      if (error) throw error;
      return;
    }
    case "update_journal_state": {
      // Upsert on (user_id, entry_date) same as journalRepo.saveEntry
      // (Step 3.4) — merges into today's entry rather than overwriting
      // fields this proposal doesn't know about. formatLocalDate, not
      // toISOString() — see that function's comment for why (UTC vs the
      // browser's local/Europe/Paris date near midnight).
      const today = formatLocalDate(new Date());
      const energyDelta = typeof fields.energy_delta === "number" ? fields.energy_delta : null;
      const { data: existing } = await supabase.from("journal_entries").select("energy, text_content").eq("user_id", userId).eq("entry_date", today).maybeSingle();
      const baseEnergy = existing?.energy ?? 3;
      const newEnergy = energyDelta !== null ? Math.max(1, Math.min(5, baseEnergy + energyDelta)) : baseEnergy;
      const note = typeof fields.note === "string" ? fields.note : "";
      const mergedText = existing?.text_content ? `${existing.text_content}\n${note}` : note;
      const { error } = await supabase
        .from("journal_entries")
        .upsert({ user_id: userId, entry_date: today, energy: newEnergy, text_content: mergedText, ai_feedback_status: "pending" }, { onConflict: "user_id,entry_date" });
      if (error) throw error;
      return;
    }
  }
}

export function ActionProposalCard({ proposalId, actionType, proposedFields, explanation, status, createdAt, onResolved }: ActionProposalCardProps) {
  const [localStatus, setLocalStatus] = useState(() => (status === "proposed" && createdAt && isProposalExpired(createdAt) ? "expired" : status));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Lazily flip the DB row to `expired` once we notice it's stale — there's
  // no cron job for this (04_ApplicationFlow.md §2.4's "expired" state was
  // previously pure type-level scaffolding with no runtime path at all).
  // Guarded server-side by `.eq("status", "proposed")` so this can't race a
  // genuine confirm/dismiss.
  useEffect(() => {
    if (localStatus === "expired") {
      // Best-effort — the UI already shows "expired" from local state
      // regardless, so a failure here is never user-facing. Logged (not
      // silently swallowed) so a persistent failure is still discoverable.
      expireProposal(proposalId).catch((err) => console.error("expireProposal failed", err));
    }
  }, [localStatus, proposalId]);

  const handleConfirm = async () => {
    if (localStatus !== "proposed" || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new ProposalValidationError("Non authentifié");

      // Idempotency: atomically CLAIM the proposal first (conditional
      // UPDATE ... WHERE status='proposed', with the row returned only on
      // a successful match) before doing any domain write. The previous
      // implementation did a plain SELECT to check status, then the domain
      // insert, then the status UPDATE — a check-then-act race: two rapid
      // clicks (or a reload mid-confirm racing a still-inflight request)
      // could both pass the SELECT while status was still 'proposed' and
      // both insert into the domain table before either UPDATE landed,
      // producing a real duplicate row. Confirmed live via Playwright
      // against the production build: a single double-click produced two
      // `finance_entries` rows for one proposal. Flipping the status to
      // 'confirmed' FIRST via a conditional update means only the request
      // that actually wins the race (the one whose UPDATE matches a row)
      // proceeds to commitProposal — any loser sees zero rows returned and
      // treats it as "already confirmed elsewhere" instead of writing again.
      const { data: claimed, error: claimError } = await supabase
        .from("action_proposals")
        .update({ status: "confirmed", resolved_at: new Date().toISOString() })
        .eq("id", proposalId)
        .eq("status", "proposed")
        .select("id");
      if (claimError) throw claimError;

      if (!claimed || claimed.length === 0) {
        // Lost the race (or it was already confirmed/dismissed/expired by
        // a previous action) — do not write to any domain table.
        setLocalStatus("confirmed");
        onResolved?.("confirmed");
        return;
      }

      try {
        await commitProposal(actionType, proposedFields, userId, proposalId);
      } catch (commitErr) {
        // The domain write failed after we already claimed the proposal —
        // revert the claim so the user can retry Confirm instead of being
        // stuck on a "confirmed" proposal that never actually wrote data.
        await supabase
          .from("action_proposals")
          .update({ status: "proposed", resolved_at: null })
          .eq("id", proposalId)
          .eq("status", "confirmed");
        throw commitErr;
      }

      setLocalStatus("confirmed");
      onResolved?.("confirmed");
    } catch (err) {
      // Only ProposalValidationError's message is safe to show verbatim —
      // any other error (e.g. a raw Supabase/Postgres error from the
      // updates above) must never leak internal detail to the user.
      setError(err instanceof ProposalValidationError ? err.message : "La confirmation a échoué — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (localStatus !== "proposed" || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("action_proposals")
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", proposalId)
        .eq("status", "proposed");
      if (updateError) throw updateError;
      setLocalStatus("dismissed");
      onResolved?.("dismissed");
    } catch {
      // handleDismiss's only failure path is a raw Supabase update error —
      // never anything safe to show verbatim.
      setError("Le rejet a échoué — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  if (localStatus === "confirmed") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-label font-semibold text-green-text"
      >
        <Check size={12} /> Ajouté
      </motion.div>
    );
  }

  if (localStatus === "dismissed") {
    return null;
  }

  if (localStatus === "expired") {
    return (
      <div className="rounded-lg border-[1.5px] border-border bg-bg-dark p-3.5 opacity-60">
        <p className="mb-1.5 flex items-center gap-1 text-label font-bold uppercase tracking-[0.06em] text-text-muted">
          <Clock size={12} /> Suggestion expirée
        </p>
        <p className="mb-1 text-body-sm font-semibold text-text-mid">{ACTION_LABELS[actionType]}</p>
        <p className="text-body-sm text-text-muted">{explanation}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-[1.5px] border-gold bg-gold-soft p-3.5">
      <p className="mb-1.5 text-label font-bold uppercase tracking-[0.06em] text-gold-text">Suggestion — pas encore appliquée</p>
      <p className="mb-1 text-body-sm font-semibold text-navy">{ACTION_LABELS[actionType]}</p>
      <p className="mb-3 text-body-sm text-text-mid">{explanation}</p>
      {error && <p className="mb-2 text-body-sm text-red-text">{error}</p>}
      <div className="flex gap-2">
        <Button variant="accent" size="sm" onClick={handleConfirm} disabled={busy} className="flex-1">
          {busy ? "Confirmation..." : "Confirmer"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDismiss} disabled={busy} className="flex-1">
          {busy ? "Rejet..." : "Ignorer"}
        </Button>
      </div>
    </div>
  );
}
