import type { Task } from "@/lib/agendaRepo";
import type { FocusSessionRow } from "@/lib/focusRepo";

/**
 * Focus screen types — Step 7.6 migrated onto real `focus_sessions`
 * (linked_task_id, not free text) and a real task picker. `FocusSession`
 * is still the in-progress-session localStorage draft shape (a genuine
 * draft-recovery need for a live countdown surviving a refresh, not a
 * persistence gap — the actual completed-session log now lives in the
 * real table via focusRepo.ts).
 */
export interface FocusSession {
  linkedTaskId: string | null;
  duree: number;
  endTime: number;
  startedAt: string;
  aiMsg?: string;
}

export interface FocusScreenProps {
  userId: string;
  openTasks: Task[];
  onSessionDone?: (session: FocusSessionRow) => void;
  loading?: boolean;
  loadError?: string;
  onRetryLoad?: () => void;
}
