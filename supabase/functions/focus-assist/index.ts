// focus-assist — server-side replacement for FocusScreen's two askClare
// calls (mental-prep before a session, bilan after). Not a dedicated
// docs/06_AIPromptRegistry.md entry (no direct registry mapping existed
// for Focus) — built as part of Step 4.2's expanded scope to fully retire
// api/claude.js, per an explicit decision to migrate every screen's AI
// call rather than leave some on the old client-exposed proxy. Same
// guardrails as every other function here: server-owned prompt, fixed
// max_tokens, no client override accepted.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeText, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 300;

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

    const { allowed } = await checkDailyMessageLimit(client, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Limite quotidienne atteinte." }), { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const mode: "prep" | "bilan" = body.mode === "bilan" ? "bilan" : "prep";
    const projet: string = typeof body.projet === "string" ? body.projet : "";
    const duree: number = Number.isFinite(body.duree) ? body.duree : 0;
    const notes: string = typeof body.notes === "string" ? body.notes : "";

    if (!projet.trim()) {
      return new Response(JSON.stringify({ error: "projet is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const ctx = await buildFullContext(client, userId);
    const systemPrompt = buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux);

    const userMessage =
      mode === "prep"
        ? `Je lance ${duree} minutes de focus sur : "${projet}". Prépare-moi mentalement en 3 phrases max. Dis-moi comment aborder cette session efficacement.`
        : `Session focus terminée (${duree}min) sur "${projet}". Notes de session : "${notes}". Fais un bilan rapide et dis-moi quelle est la prochaine action concrète.`;

    const { result: text, usage } = await callClaudeText({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("focus-assist", userId, usage);

    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
