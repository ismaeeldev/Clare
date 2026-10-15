import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * ideasRepo — Step 7.6's data layer for `ideas` (docs/05_DataModel.md
 * §2.12). Migrates IdeesScreen off its `clare_idees` localStorage slot —
 * clerk-extract (Step 4.4) already writes real `ideas` rows on confirm
 * (source='brain_dump'), so this repo also makes manual-add rows real,
 * giving both sources a single unified list for the first time.
 */
export interface IdeaRow {
  id: string;
  user_id: string;
  text: string;
  category: "pro" | "perso" | null;
  linked_project: string | null;
  source: "manual" | "brain_dump";
  created_at: string;
}

export async function fetchIdeas(userId: string, limit = 100): Promise<IdeaRow[]> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("ideas").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as IdeaRow[];
}

export async function addIdea(userId: string, text: string, category: "pro" | "perso" | null, linkedProject: string | null): Promise<IdeaRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("ideas")
        .insert({ user_id: userId, text, category, linked_project: linkedProject, source: "manual" })
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as IdeaRow;
}

export async function deleteIdea(id: string): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("ideas").delete().eq("id", id)));
  if (error) throw error;
}

export async function updateIdeaProject(id: string, linkedProject: string | null): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("ideas").update({ linked_project: linkedProject }).eq("id", id)));
  if (error) throw error;
}
