/**
 * Chat screen types — Step 4.3. The screen now owns its own persistence
 * (conversations/messages tables) and calls real Edge Functions, so it
 * only needs userId as a prop — same shift as Step 3.4's Journal rebuild.
 */
export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatScreenProps {
  userId: string;
  initialMsg?: string;
  onBack: () => void;
}
