// chat-respond — docs/06_AIPromptRegistry.md §2.1.
// Trigger: user sends a chat message.
// Output: { reply_text, detected_action_proposal?, quick_replies? }.
// Guardrail: an actionable request must emit a proposal object, never just
// assert in reply_text that something was done — "AI said" vs "AI did" is
// a hard product requirement (CLA-FR-006).
//
// Per docs/03_MasterPrompts.md Step 4.3 task 3: when detected_action_proposal
// is present, this function writes it to action_proposals with status
// 'proposed' — it NEVER writes to any domain table (tasks/calendar_items/
// finance_entries) directly. That only happens on the client's explicit
// Confirm tap, via a separate confirmed write (Step 4.3's Chat UI), keyed
// on the proposal's idempotency_key so re-confirming an already-confirmed
// proposal can't double-write.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildCompactContext } from "../_shared/context.ts";
import { callClaudeStructured, logTokenUsage, type ClaudeMessage } from "../_shared/claude.ts";
import { chatRespondOutputSchema } from "../_shared/schemas.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 1000;
const MAX_HISTORY_MESSAGES = 20;
const PROMPT_VERSION = "chat-respond-v1";

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof buildCompactContext>>): string {
  return `Tu es Claré, l'assistant de vie personnel d'un(e) entrepreneur(se) indépendant(e) français(e). Ton direct et bienveillant, jamais corporate.

Contexte réel de l'utilisateur (n'invente RIEN au-delà de ces faits) :
- Prénom : ${ctx.displayName || "non renseigné"}
- Rendez-vous aujourd'hui : ${ctx.todayAppointments.length > 0 ? ctx.todayAppointments.map((a) => `${a.time} ${a.title}`).join(", ") : "aucun"}
- CA du mois : ${ctx.revenueThisMonth}€ ${ctx.revenueGoal > 0 ? `sur un objectif de ${ctx.revenueGoal}€` : "(pas d'objectif défini)"}
- Signal de fatigue détecté : ${ctx.fatigueSignal ? "oui" : "non"}

RÈGLES STRICTES :
1. N'invente aucun fait qui n'est pas dans ce contexte ou dans le message de l'utilisateur.
2. Si l'utilisateur demande une action concrète (ajouter un rendez-vous, noter une dépense/un revenu, créer une tâche), tu DOIS renvoyer un objet detected_action_proposal — ne dis JAMAIS dans reply_text que tu l'as fait, tu ne fais que PROPOSER, l'utilisateur confirme ensuite.
3. Types d'action valides et leurs champs EXACTS dans proposed_fields (n'utilise AUCUN autre nom de champ ni AUCUNE autre valeur que celles listées) :
   - create_task : { "title": string, "due_date": string au format YYYY-MM-DD ou "tomorrow" ou null }
   - create_calendar_item : { "title": string, "date": string au format YYYY-MM-DD ou "tomorrow", "time": string au format HH:MM }
   - create_finance_entry : { "amount": number, "type": EXACTEMENT "revenue" ou "expense" (jamais "income", "depense", ou toute autre valeur), "date": string au format YYYY-MM-DD ou "today", "category": string ou null }
   - replan_week : { "reason": string }
4. Ne donne aucun conseil médical.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const client = getUserClient(req)!;

    const { entitled } = await checkEntitlement(client, userId);
    if (!entitled) {
      return new Response(JSON.stringify({ error: "Un abonnement actif est requis pour utiliser cette fonctionnalité." }), {
        status: 402,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { allowed, count } = await checkDailyMessageLimit(client, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: `Limite quotidienne de messages atteinte (${count}).` }), {
        status: 429,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId: string | undefined = body.conversation_id;
    const userMessageText: string = typeof body.message === "string" ? body.message : "";
    // Generated once per send attempt on the client and reused across any
    // retry of that SAME attempt (never regenerated on retry) — see
    // migration 0018. A client that races chat-respond's 45s timeout while
    // the server-side call is still in flight, then retries, would
    // otherwise insert the same user message twice once the first attempt
    // also reaches this insert. Optional: older clients (or other callers
    // of this function) that don't send one simply don't get the guard.
    const idempotencyKey: string | undefined = typeof body.idempotency_key === "string" ? body.idempotency_key : undefined;
    if (!userMessageText.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversation_id is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Persist the user's own message first — save-first, same reliability
    // principle as Journal (Step 3.4): the user's message is never lost
    // even if the AI call below fails. A retried call with the same
    // idempotency_key hits the unique-index conflict and is treated as
    // "already inserted" rather than inserting a duplicate row.
    if (idempotencyKey) {
      const { error: insertUserMsgError } = await client
        .from("messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "user", content: userMessageText, idempotency_key: idempotencyKey })
        .select("id")
        .single();
      if (insertUserMsgError && insertUserMsgError.code !== "23505") throw insertUserMsgError;
    } else {
      const { error: insertUserMsgError } = await client
        .from("messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "user", content: userMessageText });
      if (insertUserMsgError) throw insertUserMsgError;
    }

    // Bounded conversation history — registry §1 rule 4 / §3.
    const { data: historyRows, error: historyError } = await client
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    if (historyError) throw historyError;

    const history: ClaudeMessage[] = (historyRows ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

    const ctx = await buildCompactContext(client, userId);

    const { result, usage } = await callClaudeStructured({
      systemPrompt: buildSystemPrompt(ctx),
      messages: history,
      toolName: "chat_response",
      toolDescription: "Renvoie la réponse de Claré, et une proposition d'action si l'utilisateur en a demandé une.",
      outputSchema: {
        type: "object",
        properties: {
          reply_text: { type: "string" },
          detected_action_proposal: {
            type: "object",
            properties: {
              action_type: { type: "string", enum: ["create_task", "create_calendar_item", "create_finance_entry", "replan_week"] },
              proposed_fields: { type: "object" },
              confidence: { type: "number" },
              explanation: { type: "string" },
            },
            required: ["action_type", "proposed_fields", "explanation"],
          },
          quick_replies: { type: "array", items: { type: "string" } },
        },
        required: ["reply_text"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("chat-respond", userId, usage);

    const parsed = chatRespondOutputSchema.parse(result);

    // Same retry-duplication concern as the user-message insert above: if
    // this exact request is retried with the same idempotency_key (e.g.
    // the client's 45s timeout fired just as this function was finishing,
    // and the user tapped Retry), the assistant reply and any detected
    // action proposal must not be written twice either. Suffix the
    // client's single key per-row so the user/assistant/proposal rows each
    // get their own distinct-but-derived key rather than colliding with
    // each other under the same unique index.
    const assistantIdempotencyKey = idempotencyKey ? `${idempotencyKey}:assistant` : undefined;
    const assistantInsert = assistantIdempotencyKey
      ? client
          .from("messages")
          .insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            content: parsed.reply_text,
            metadata: parsed.detected_action_proposal ? { has_action_proposal: true } : {},
            idempotency_key: assistantIdempotencyKey,
          })
          .select("id")
      : client.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: parsed.reply_text,
          metadata: parsed.detected_action_proposal ? { has_action_proposal: true } : {},
        });
    const { error: insertAssistantMsgError } = await assistantInsert;
    if (insertAssistantMsgError && insertAssistantMsgError.code !== "23505") throw insertAssistantMsgError;

    let actionProposalId: string | null = null;
    if (parsed.detected_action_proposal) {
      const proposalIdempotencyKey = idempotencyKey ? `${idempotencyKey}:proposal` : crypto.randomUUID();
      // A retried request with the same key hits the unique-index conflict
      // on insert; fetch the already-created row instead of erroring, so
      // the retry still returns a usable action_proposal_id.
      const { data: existingProposal } = idempotencyKey
        ? await client.from("action_proposals").select("id").eq("idempotency_key", proposalIdempotencyKey).maybeSingle()
        : { data: null };
      if (existingProposal) {
        actionProposalId = existingProposal.id;
      } else {
        const { data: proposalRow, error: proposalError } = await client
          .from("action_proposals")
          .insert({
            user_id: userId,
            conversation_id: conversationId,
            action_type: parsed.detected_action_proposal.action_type,
            proposed_fields: parsed.detected_action_proposal.proposed_fields,
            confidence: parsed.detected_action_proposal.confidence ?? null,
            explanation: parsed.detected_action_proposal.explanation,
            status: "proposed",
            prompt_version: PROMPT_VERSION,
            model_id: "claude-sonnet-4-5",
            idempotency_key: proposalIdempotencyKey,
          })
          .select("id")
          .single();
        if (proposalError) throw proposalError;
        actionProposalId = proposalRow.id;
      }
    }

    return new Response(JSON.stringify({ ...parsed, action_proposal_id: actionProposalId }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
