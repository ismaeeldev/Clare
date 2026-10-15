import type { BuildSystemPromptAgendaItem, BuildSystemPromptFinances, BuildSystemPromptProfile, BuildSystemPromptRoutine } from "@/lib/buildSystemPrompt";
import type { CoherenceFocusLogEntry, CoherenceJournalEntry } from "@/lib/calculerCoherence";

/**
 * PrepDimanche screen types — extracted from App.jsx's PrepDimanche
 * component props (line 3033) and its 2-call AI brief JSON shape.
 */
export interface PrepDimancheForm {
  chargeSemaine: string;
  objectifPrincipal: string;
  contraintes: string;
  sportPrevu: string;
}

export interface PrepDimancheJour {
  jour: string;
  date: string;
  alerte?: string | null;
  conseil?: string;
  tache_1?: string;
  taches_3?: string[];
  taches_5?: string[];
  repasMidi?: string;
  repasSoir?: string;
}

export interface PrepDimancheBrief {
  resume?: string;
  priorites?: string[];
  miroir_projets?: string;
  ne_pas_faire?: string[];
  finances?: string;
  motivation?: string;
  courses?: string[];
  jours?: PrepDimancheJour[];
  erreur?: string;
}

export interface PrepDimancheBriefEntry {
  date: string;
  data: PrepDimancheBrief;
  type: "brief_dimanche";
}

export interface PrepDimancheAgendaItem extends BuildSystemPromptAgendaItem {
  id: number;
}

export interface PrepDimancheScreenProps {
  userId: string;
  profile: BuildSystemPromptProfile;
  journal: CoherenceJournalEntry[];
  agenda: PrepDimancheAgendaItem[];
  finances: BuildSystemPromptFinances;
  focusLog?: CoherenceFocusLogEntry[];
  routine?: BuildSystemPromptRoutine;
  onBack: () => void;
  onBriefSaved: (entry: PrepDimancheBriefEntry) => void;
  loading?: boolean;
}
