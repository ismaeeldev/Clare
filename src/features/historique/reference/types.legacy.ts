import type { CoherenceJournalEntry } from "@/lib/calculerCoherence";

/**
 * Historique screen types — extracted from App.jsx's Historique component
 * props (line 3867) and its journal-entry display shape.
 */
export type HistoriqueFiltre = "tout" | "sport" | "revenus" | "energie";

export interface HistoriqueJournalEntry extends CoherenceJournalEntry {
  texte?: string;
  projet?: string;
  repas?: string;
}

export interface HistoriqueScreenProps {
  journal: HistoriqueJournalEntry[];
}
