// Server-side Claude client for Edge Functions. Uses tool-use (forced
// tool_choice) to get real structured JSON output, per
// docs/06_AIPromptRegistry.md §1 rule 2 — never free-text parsing.
//
// Deliberately does NOT accept a caller-supplied system prompt or
// max_tokens override — every Edge Function that uses this builds its own
// system prompt server-side and passes a fixed max_tokens constant, per
// CLA-FR-005's hard requirement (docs/03_MasterPrompts.md Step 4.2 task 3).

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-5";

// Every client-side call into an edge function that uses this module has
// its own timeout (e.g. chat-respond's 45s in ChatScreen.tsx) — but until
// now this fetch had none, relying only on the Supabase platform's own
// (much longer) function timeout. That gap is exactly what let a chat
// message get saved, the client give up and let the user hit "Retry", and
// the ORIGINAL call still complete afterward and save a second time: the
// server-side Claude call could still be running well past the point the
// client had already moved on. 35s keeps ~10s of margin under chat-
// respond's 45s client timeout for the rest of the function's own work
// (DB reads/writes) to still finish and return a clean response/error
// before the client's timeout fires — closing the race window rather than
// papering over it with the idempotency key alone.
const CLAUDE_FETCH_TIMEOUT_MS = 35_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Claude n'a pas répondu dans le délai imparti (${Math.round(timeoutMs / 1000)}s) — réessaie.`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Token-usage logging — docs/03_MasterPrompts.md Step 4.2 task 4: "Record
 * token usage per call (for later admin visibility) without logging full
 * sensitive prompt/journal content by default (NFR-02 privacy)." Logged to
 * the Edge Function's own stdout (captured by Supabase's function logs,
 * viewable in the dashboard) rather than a dedicated DB table — no table
 * for per-call usage rows exists in the Phase 2 schema (05_DataModel.md
 * §1), and adding one is a schema change outside this fix's scope. Every
 * field logged here is metadata only (caller function name, user id,
 * token counts) — never the prompt or response content itself.
 */
export function logTokenUsage(functionName: string, userId: string, usage: TokenUsage | undefined): void {
  if (!usage) return;
  console.log(
    JSON.stringify({
      event: "claude_token_usage",
      function: functionName,
      user_id: userId,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      at: new Date().toISOString(),
    })
  );
}

/**
 * Calls Claude with a forced tool_choice so the response is guaranteed to
 * be the tool's structured input, not free text — the caller then still
 * runs the actual Zod schema over it (this function doesn't validate
 * schema conformance itself, callers do, so the exact validation error is
 * visible to them).
 */
export async function callClaudeStructured({
  systemPrompt,
  messages,
  toolName,
  toolDescription,
  outputSchema,
  maxTokens,
}: {
  systemPrompt: string;
  messages: ClaudeMessage[];
  toolName: string;
  toolDescription: string;
  outputSchema: JsonSchema;
  maxTokens: number;
}): Promise<{ result: unknown; usage: TokenUsage | undefined }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured on the server");
  }

  const res = await fetchWithTimeout(
    ANTHROPIC_API_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools: [
          {
            name: toolName,
            description: toolDescription,
            input_schema: outputSchema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      }),
    },
    CLAUDE_FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block");
  }
  return { result: toolUse.input, usage: data.usage };
}

/**
 * Plain free-text Claude call — for the handful of prompts whose contract
 * is genuinely "a short natural-language response" rather than a
 * structured object (Focus's mental-prep/session-bilan messages). Still
 * server-owned with a fixed max_tokens, same as callClaudeStructured.
 */
export async function callClaudeText({
  systemPrompt,
  messages,
  maxTokens,
}: {
  systemPrompt: string;
  messages: ClaudeMessage[];
  maxTokens: number;
}): Promise<{ result: string; usage: TokenUsage | undefined }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured on the server");
  }

  const res = await fetchWithTimeout(
    ANTHROPIC_API_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: systemPrompt, messages }),
    },
    CLAUDE_FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((block: { type: string }) => block.type === "text");
  return { result: textBlock?.text ?? "", usage: data.usage };
}
