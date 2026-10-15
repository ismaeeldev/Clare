/**
 * Idees screen types — Step 7.6 migrated this screen off a local `Idee`
 * shape onto `IdeaRow` (src/lib/ideasRepo.ts, the real `ideas` table row)
 * directly. Only the filter type remains local to the screen.
 */
export type IdeeCategorie = "perso" | "pro";
export type IdeeFiltre = "toutes" | IdeeCategorie;
