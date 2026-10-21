import type { BuildSystemPromptFinances, BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import type { CoherenceFocusLogEntry, CoherenceJournalEntry } from "@/lib/calculerCoherence";

/**
 * Stats screen types — extracted from App.jsx's Stats component props
 * (line 1955) and its AI weekly-bilan JSON shape. Step 4.2 dropped
 * agenda/lieux/routine — only used to build the old client-side prompt.
 */
export interface StatsBilan {
  note?: string;
  resume?: string;
  points_forts?: string[];
  points_attention?: string[];
  priorites_semaine_prochaine?: string[];
  motivation?: string;
  erreur?: string;
}

export interface StatsScreenProps {
  profile: BuildSystemPromptProfile;
  journal: CoherenceJournalEntry[];
  finances: BuildSystemPromptFinances;
  // Separate from `finances` (a monthly total fed only into
  // calculerCoherence's score, left untouched here to avoid changing that
  // calculation's behavior) — this is the real last-7-days total from the
  // finance_entries table (manual + AI-confirmed), inclusive of today.
  // Client report: "7-day Finances" never included today's entries,
  // because the card previously read from journal_entries.revenue/
  // expenses — a separate, single-per-day rollup field most users never
  // fill in — instead of the real transactional ledger.
  weekFinances: { revenus: number; depenses: number };
  focusLog?: CoherenceFocusLogEntry[];
  loading?: boolean;
  refreshing?: boolean;
  loadError?: string;
  onRetryLoad?: () => void;
  onRefresh?: () => void;
}
