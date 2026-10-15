import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * notificationsRepo — Step 6.3's data layer for `notifications`
 * (docs/05_DataModel.md §2.10). Rows are written server-side only
 * (scheduled-agents, prepared-agents' future domain-write path, etc.) —
 * this repo is read/update only, matching the table's actual write
 * surface in this project.
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  deep_link: string | null;
  read: boolean;
  source_agent_run_id: string | null;
  created_at: string;
}

export async function fetchNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("notifications").update({ read: true }).eq("id", id)));
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await apiCall(() =>
    Promise.resolve(supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false))
  );
  if (error) throw error;
}
