import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * journalRepo — Step 3.4's data layer for `journal_entries` and
 * `finance_entries` (docs/05_DataModel.md §2.5-2.6). Implements the
 * save-first pattern required by CLA-FR-011: the row commits immediately
 * with ai_feedback_status='pending'; the async AI feedback call itself is
 * NOT built here (that's Step 4) — this repo only makes sure the write
 * path never depends on it.
 *
 * Also implements the offline queue (docs/04_ApplicationFlow.md §3's
 * Offline row: Journal is explicitly offline-capable, unlike Agenda).
 */

const OFFLINE_QUEUE_KEY = "clare:journal_offline_queue";

export interface JournalEntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  text_content: string | null;
  energy: number | null;
  mood: number | null;
  revenue: number | null;
  expenses: number | null;
  meals_note: string | null;
  project_touched: string | null;
  workout_status: "done" | "light" | "none" | null;
  workout_detail: string | null;
  workout_duration_seconds: number | null;
  ai_feedback: string | null;
  ai_feedback_status: "pending" | "ready" | "failed";
  created_at: string;
  updated_at: string;
}

export interface NewJournalEntry {
  entry_date: string;
  text_content: string;
  energy: number;
  mood: number;
  revenue: number;
  expenses: number;
  meals_note: string;
  project_touched: string;
  workout_status: "done" | "light" | "none";
  workout_detail: string;
}

interface QueuedEntry extends NewJournalEntry {
  queuedAt: string;
}

function readQueue(): QueuedEntry[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEntry[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort — if localStorage itself is unavailable there's no
    // further fallback; the in-memory save already happened for this
    // session, which is the primary guarantee CLA-FR-011 asks for.
  }
}

export function hasQueuedEntries(): boolean {
  return readQueue().length > 0;
}

/**
 * Queues an entry for later sync when offline. Overwrites any existing
 * queued entry for the same date (same save-first semantics as the online
 * path: today's entry, upserted, never duplicated).
 */
export function queueEntry(userId: string, entry: NewJournalEntry): void {
  const queue = readQueue().filter((q) => q.entry_date !== entry.entry_date);
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  writeQueue(queue);
  // Tag the queue with the user it belongs to isn't needed today (single
  // active session), but userId is accepted for the call-site symmetry
  // with saveEntry and to make a future multi-account queue key trivial.
  void userId;
}

/** Flushes every queued entry to Supabase; returns how many synced. */
export async function flushQueue(userId: string): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  let synced = 0;
  const remaining: QueuedEntry[] = [];
  for (const entry of queue) {
    try {
      await saveEntry(userId, entry);
      synced++;
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
  return synced;
}

/**
 * Save-first write: upsert on (user_id, entry_date) — same day re-saved
 * overwrites rather than duplicating, matching the unique constraint in
 * 05_DataModel.md §2.5. Always writes ai_feedback_status='pending';
 * nothing here waits on or calls the AI (Step 4's job).
 */
export async function saveEntry(userId: string, entry: NewJournalEntry): Promise<JournalEntryRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("journal_entries")
        .upsert(
          {
            user_id: userId,
            entry_date: entry.entry_date,
            text_content: entry.text_content,
            energy: entry.energy,
            mood: entry.mood,
            revenue: entry.revenue,
            expenses: entry.expenses,
            meals_note: entry.meals_note,
            project_touched: entry.project_touched,
            workout_status: entry.workout_status,
            workout_detail: entry.workout_detail,
            ai_feedback_status: "pending",
          },
          { onConflict: "user_id,entry_date" }
        )
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as JournalEntryRow;
}

/**
 * Merges a Live Workout Mode session's result into today's journal entry —
 * 04_ApplicationFlow.md §2.8's "finished" state writes sport status,
 * duration, and full free-text detail. Reads the existing row first (if
 * any) and only overwrites the workout_* fields, preserving whatever else
 * the user already logged for today (text/energy/mood/finances) rather
 * than clobbering it — same merge-not-replace principle as
 * ActionProposalCard's update_journal_state case.
 */
export async function saveWorkoutResult(
  userId: string,
  entryDate: string,
  workoutDetail: string,
  workoutDurationSeconds: number
): Promise<JournalEntryRow> {
  const existing = await fetchEntryForDate(userId, entryDate);
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("journal_entries")
        .upsert(
          {
            user_id: userId,
            entry_date: entryDate,
            text_content: existing?.text_content ?? null,
            energy: existing?.energy ?? null,
            mood: existing?.mood ?? null,
            revenue: existing?.revenue ?? null,
            expenses: existing?.expenses ?? null,
            meals_note: existing?.meals_note ?? null,
            project_touched: existing?.project_touched ?? null,
            workout_status: "done",
            workout_detail: workoutDetail,
            workout_duration_seconds: workoutDurationSeconds,
            ai_feedback_status: existing?.ai_feedback_status ?? "pending",
          },
          { onConflict: "user_id,entry_date" }
        )
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as JournalEntryRow;
}

export async function fetchEntries(userId: string, limit = 60): Promise<JournalEntryRow[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }).limit(limit)
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as JournalEntryRow[];
}

export async function fetchEntryForDate(userId: string, entryDate: string): Promise<JournalEntryRow | null> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("journal_entries").select("*").eq("user_id", userId).eq("entry_date", entryDate).maybeSingle()),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return data as JournalEntryRow | null;
}

/** Most recent prior entry with a real workout (for the "last session" comparison). */
export async function fetchLastWorkoutEntry(userId: string, beforeDate: string): Promise<JournalEntryRow | null> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase
          .from("journal_entries")
          .select("*")
          .eq("user_id", userId)
          .neq("workout_status", "none")
          .lt("entry_date", beforeDate)
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return data as JournalEntryRow | null;
}

export interface FinanceEntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  amount: number;
  type: "revenue" | "expense";
  category: string | null;
  note: string | null;
  source: "manual" | "ai_confirmed";
  created_at: string;
}

export interface NewFinanceEntry {
  entry_date: string;
  amount: number;
  type: "revenue" | "expense";
  category?: string;
  note?: string;
}

export async function addFinanceEntry(userId: string, entry: NewFinanceEntry): Promise<FinanceEntryRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("finance_entries")
        .insert({
          user_id: userId,
          entry_date: entry.entry_date,
          amount: entry.amount,
          type: entry.type,
          category: entry.category ?? null,
          note: entry.note ?? null,
          source: "manual",
        })
        .select()
        .single()
    )
  );
  if (error) throw error;
  return data as FinanceEntryRow;
}

export async function fetchFinanceEntries(userId: string, limit = 100): Promise<FinanceEntryRow[]> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("finance_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }).limit(limit)),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as FinanceEntryRow[];
}
