import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * agendaRepo — Step 3.3's data layer for `tasks` and `calendar_items`
 * (docs/05_DataModel.md §2.3), manual CRUD only. Reads retry once on
 * timeout (safe — idempotent); writes never retry (a retried insert/delete
 * could double-write or race against itself).
 */

export interface CalendarItem {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  source: "manual" | "ai_confirmed" | "google_calendar";
  source_proposal_id: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  status: "open" | "done" | "dropped";
  priority: "big" | "medium" | "small" | null;
  due_date: string | null;
  source: "manual" | "ai_confirmed" | "weekly_plan";
  source_proposal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewCalendarItem {
  title: string;
  starts_at: string;
  ends_at?: string | null;
}

export interface NewTask {
  title: string;
  due_date?: string | null;
  priority?: Task["priority"];
}

/** Calendar items whose starts_at falls within [weekStartIso, weekEndIso). */
export async function fetchWeekCalendarItems(userId: string, weekStartIso: string, weekEndIso: string): Promise<CalendarItem[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase
          .from("calendar_items")
          .select("*")
          .eq("user_id", userId)
          .gte("starts_at", weekStartIso)
          .lt("starts_at", weekEndIso)
          .order("starts_at", { ascending: true })
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as CalendarItem[];
}

export async function fetchOpenTasks(userId: string): Promise<Task[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("tasks").select("*").eq("user_id", userId).neq("status", "dropped").order("due_date", { ascending: true, nullsFirst: false })
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Fetches specific tasks by id, regardless of status — used to resolve focus_sessions.linked_task_id titles even for done/dropped tasks fetchOpenTasks would exclude. */
export async function fetchTasksByIds(taskIds: string[]): Promise<Task[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await apiCall(() => Promise.resolve(supabase.from("tasks").select("*").in("id", taskIds)), { retryOnTimeout: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createCalendarItem(userId: string, item: NewCalendarItem): Promise<CalendarItem> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("calendar_items")
        .insert({ user_id: userId, title: item.title, starts_at: item.starts_at, ends_at: item.ends_at ?? null, source: "manual" })
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as CalendarItem;
}

export async function deleteCalendarItem(id: string): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("calendar_items").delete().eq("id", id)));
  if (error) throw error;
}

export async function createTask(userId: string, task: NewTask): Promise<Task> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("tasks")
        .insert({ user_id: userId, title: task.title, due_date: task.due_date ?? null, priority: task.priority ?? null, source: "manual" })
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("tasks").delete().eq("id", id)));
  if (error) throw error;
}

export async function toggleTaskDone(id: string, done: boolean): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("tasks").update({ status: done ? "done" : "open" }).eq("id", id)));
  if (error) throw error;
}
