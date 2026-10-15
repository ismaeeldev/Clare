import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * focusRepo — Step 7.6's data layer for `focus_sessions`
 * (docs/05_DataModel.md §2.13). Migrates FocusScreen off `clare_focus_log`
 * localStorage. A session ties to a real `tasks` row (linked_task_id) —
 * the schema has no free-text field for an ad-hoc project name, so
 * Focus's setup step picks from the user's real open tasks rather than
 * typing one in (Step 7.6's own explicit spec: "tied to a selected task
 * from the tasks table").
 */
export interface FocusSessionRow {
  id: string;
  user_id: string;
  linked_task_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export async function fetchFocusLog(userId: string, limit = 50): Promise<FocusSessionRow[]> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("focus_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as FocusSessionRow[];
}

export async function saveFocusSession(userId: string, linkedTaskId: string | null, startedAt: string, endedAt: string, durationSeconds: number): Promise<FocusSessionRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("focus_sessions")
        .insert({ user_id: userId, linked_task_id: linkedTaskId, started_at: startedAt, ended_at: endedAt, duration_seconds: durationSeconds })
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as FocusSessionRow;
}
