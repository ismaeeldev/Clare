/**
 * Journal screen types — Step 3.4, rebuilt against the real
 * `journal_entries` table (docs/05_DataModel.md §2.5). The screen now owns
 * its own data (loads/saves via journalRepo, keyed on the authenticated
 * user), so it only needs `userId` as a prop rather than the full
 * profile/journal/agenda/finances bundle the Step 1.3 placeholder version
 * required.
 */
export interface JournalForm {
  texte: string;
  depenses: string;
  revenus: string;
  sport: "non" | "léger" | "oui";
  energie: number;
  humeur: number;
  repas: string;
  projet: string;
  performance: string;
}

export interface JournalScreenProps {
  userId: string;
}
