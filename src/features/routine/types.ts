import type { BuildSystemPromptRoutine } from "@/lib/buildSystemPrompt";

/**
 * Routine screen types — extracted from App.jsx's MaRoutine component
 * props (line 3482) and its ROUTINE_MENAGERE constant (lines 3467-3471).
 */
export type RoutineSectionKey = "quotidien" | "hebdo" | "mensuel";

export interface RoutineScreenProps {
  userId?: string;
  onRoutineUpdated?: (routine: BuildSystemPromptRoutine) => void;
}
