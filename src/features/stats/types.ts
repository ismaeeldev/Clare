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
  focusLog?: CoherenceFocusLogEntry[];
  loading?: boolean;
  refreshing?: boolean;
  loadError?: string;
  onRetryLoad?: () => void;
  onRefresh?: () => void;
}
