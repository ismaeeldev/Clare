import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * chatRepo — Step 4.3's data layer for `conversations`/`messages`. Chat
 * itself doesn't write messages directly for the user->assistant exchange
 * (chat-respond's Edge Function does that server-side, atomically with the
 * action_proposals write) — this repo only handles conversation lifecycle
 * (find-or-create "today's" conversation, per CLA-FR-004's "start fresh
 * without losing history") and reading message history for display.
 */
export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Returns the most recent conversation for this user, or null if none
 * exists yet. Chat opens by resuming the latest conversation rather than
 * always starting fresh — "New conversation" (CLA-FR-004) is an explicit
 * user action via createConversation, not the default.
 */
export async function fetchLatestConversation(userId: string): Promise<ConversationRow | null> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("conversations").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return data as ConversationRow | null;
}

export async function createConversation(userId: string, title?: string): Promise<ConversationRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(supabase.from("conversations").insert({ user_id: userId, title: title ?? null }).select().single())
  );
  if (error) throw error;
  return data as ConversationRow;
}

export async function fetchMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true })),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

/** Inserts a single message row directly — used for the welcome message and quick-reply/disruption flows that don't go through chat-respond. */
export async function insertMessage(conversationId: string, userId: string, role: MessageRow["role"], content: string, metadata: Record<string, unknown> = {}): Promise<MessageRow> {
  const { data, error } = await apiCall(() =>
    Promise.resolve(supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role, content, metadata }).select().single())
  );
  if (error) throw error;
  return data as MessageRow;
}

export interface OpenActionProposal {
  id: string;
  action_type: string;
  proposed_fields: Record<string, unknown>;
  explanation: string;
  created_at: string;
}

/**
 * Fetches still-`proposed` action_proposals rows by id — used to rehydrate
 * ActionProposalCard on conversation history reload. Every proposal
 * message (clerk-extract, disruption-replan, chat-respond) stores its
 * proposal id in `messages.metadata.action_proposal_id`, but reloading
 * history previously only replayed message TEXT, never the card itself —
 * a page refresh mid-unconfirmed-proposal silently lost the Confirm/
 * Dismiss UI, leaving only plain text with no way to act on it. Only
 * still-`proposed` rows are fetched (a confirmed/dismissed one has
 * already resolved and doesn't need its card back).
 */
export async function fetchOpenProposals(proposalIds: string[]): Promise<Map<string, OpenActionProposal>> {
  const map = new Map<string, OpenActionProposal>();
  if (proposalIds.length === 0) return map;
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("action_proposals").select("id, action_type, proposed_fields, explanation, created_at").in("id", proposalIds).eq("status", "proposed")
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  for (const row of (data ?? []) as OpenActionProposal[]) map.set(row.id, row);
  return map;
}

/** Hours after which an unconfirmed action proposal is considered expired (04_ApplicationFlow.md §2.4). */
export const ACTION_PROPOSAL_EXPIRY_HOURS = 24;

export function isProposalExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > ACTION_PROPOSAL_EXPIRY_HOURS * 60 * 60 * 1000;
}

/**
 * Flips a stale still-`proposed` row to `expired` — called lazily when the
 * client notices a proposal has aged past ACTION_PROPOSAL_EXPIRY_HOURS,
 * since there's no cron job for this. Guarded by `.eq("status", "proposed")`
 * so a race with a genuine confirm/dismiss can't clobber it.
 */
export async function expireProposal(proposalId: string): Promise<void> {
  const { error } = await apiCall(() =>
    Promise.resolve(supabase.from("action_proposals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", proposalId).eq("status", "proposed"))
  );
  if (error) throw error;
}
