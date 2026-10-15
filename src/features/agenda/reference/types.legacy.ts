import type {
  BuildSystemPromptFinances,
  BuildSystemPromptLieu,
  BuildSystemPromptProfile,
  BuildSystemPromptRoutine,
} from "@/lib/buildSystemPrompt";
import type { CoherenceJournalEntry } from "@/lib/calculerCoherence";

/**
 * Agenda screen types — extracted from App.jsx's Agenda component props
 * (line 2314) and its event-form shape.
 */
export type AgendaEventType = "rdv" | "sport" | "perso" | "déplacement" | "focus";

export interface AgendaEvent {
  id: number;
  titre: string;
  date: string;
  heure: string;
  duree: string;
  type: AgendaEventType;
}

export interface AgendaForm {
  titre: string;
  date: string;
  heure: string;
  duree: string;
  type: AgendaEventType;
}

export interface AgendaScreenProps {
  agenda: AgendaEvent[];
  setAgenda: (agenda: AgendaEvent[]) => void;
  profile: BuildSystemPromptProfile;
  journal: CoherenceJournalEntry[];
  finances: BuildSystemPromptFinances;
  lieux?: BuildSystemPromptLieu[];
  routine?: BuildSystemPromptRoutine;
}
