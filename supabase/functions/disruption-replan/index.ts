// disruption-replan — docs/06_AIPromptRegistry.md §2.3.
// Trigger: a chat message implies a disruption to the accepted weekly plan
// ("ma fille est malade", "rdv annulé"...). Reads the real accepted
// weekly_plans row for the current week, asks Claude for a diff (what
// moved/added/dropped), and returns that diff — it NEVER writes to
// weekly_plans directly. The diff becomes an action_proposals row of type
// 'replan_week'; the actual plan update only happens when the user
// explicitly confirms that proposal (ActionProposalCard.tsx), same
// proposal→confirm→commit contract as every other AI-sourced write in this
// app (CLA-FR-006/010).
//
// Deferred from Step 4.4 specifically because this input requirement
// (a real accepted weekly_plans row) didn't exist yet — Step 6 built that
// migration (weeklyPlanRepo.ts) first, this function is what depended on
// it.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { getWeekStartKey } from "../_shared/weekDates.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { disruptionDiffSchema } from "../_shared/schemas.ts";

const MAX_TOKENS = 2000;
const PROMPT_VERSION = "disruption-replan-v1";

const SYSTEM_PROMPT = `Tu es l'agent de réorganisation de semaine de Claré, assistant de vie personnel français.

Ta tâche : lire le plan de semaine actuellement accepté par l'utilisateur et un message signalant un imprévu, puis produire un DIFF minimal — uniquement ce qui doit changer, jamais un plan entièrement réécrit.

RÈGLES :
- Ne modifie QUE ce qui est directement affecté par l'imprévu. Si un jour/une tâche n'a aucune raison de changer, laisse-le dans "unchanged_count", ne le liste PAS dans moved/added/dropped.
- "moved" : un élément existant du plan déplacé à un autre jour/moment (ex: sport déplacé du mardi au jeudi).
- "added" : un nouvel élément à ajouter suite à l'imprévu (ex: "récupérer les enfants" ajouté demain matin).
- "dropped" : un élément existant à retirer (ex: rendez-vous annulé).
- N'invente aucun horaire/date qui ne découle pas logiquement du plan existant ou de la date d'aujourd'hui.
- Réponds via l'outil fourni, jamais en texte libre.`;

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
    const conversationId: string | undefined = body.conversation_id;
    const disruptionMessage: string = typeof body.message === "string" ? body.message : "";
    if (!disruptionMessage.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const weekStartKey = getWeekStartKey();
    const { data: acceptedPlan, error: planError } = await client
      .from("weekly_plans")
      .select("id, plan, summary")
      .eq("user_id", userId)
      .eq("week_start", weekStartKey)
      .eq("status", "accepted")
      .maybeSingle();
    if (planError) throw planError;

    if (!acceptedPlan) {
      // Registry §2.3's required input context is "the accepted weekly_plans
      // row for the current week" — if none exists, there's nothing to
      // diff against. Surface this clearly rather than fabricating a diff
      // against nothing.
      return new Response(
        JSON.stringify({ error: "Aucun plan accepté pour cette semaine — impossible de proposer une réorganisation." }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const msg = `Date d'aujourd'hui : ${today}.

Plan de semaine actuellement accepté :
${JSON.stringify(acceptedPlan.plan, null, 2)}

Message signalant l'imprévu : "${disruptionMessage}"

Produis le diff minimal nécessaire pour réajuster le plan suite à cet imprévu.`;

    const { result, usage } = await callClaudeStructured({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: msg }],
      toolName: "disruption_diff",
      toolDescription: "Produit un diff minimal du plan de semaine suite à un imprévu signalé.",
      outputSchema: {
        type: "object",
        properties: {
          diff: {
            type: "object",
            properties: {
              moved: { type: "array", items: { type: "object" } },
              added: { type: "array", items: { type: "object" } },
              dropped: { type: "array", items: { type: "object" } },
              unchanged_count: { type: "number" },
            },
            required: ["moved", "added", "dropped", "unchanged_count"],
          },
          explanation: { type: "string" },
        },
        required: ["diff", "explanation"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("disruption-replan", userId, usage);

    const parsed = disruptionDiffSchema.parse(result);

    // Never writes weekly_plans directly (registry §2.3's hard guardrail)
    // — the diff becomes a replan_week action_proposals row, same
    // proposal→confirm→commit contract as every other AI-sourced write.
    const { data: proposalRow, error: proposalError } = await client
      .from("action_proposals")
      .insert({
        user_id: userId,
        conversation_id: conversationId ?? null,
        action_type: "replan_week",
        proposed_fields: { week_start: weekStartKey, weekly_plan_id: acceptedPlan.id, diff: parsed.diff },
        explanation: parsed.explanation,
        status: "proposed",
        prompt_version: PROMPT_VERSION,
        model_id: "claude-sonnet-4-5",
        idempotency_key: crypto.randomUUID(),
      })
      .select("id, action_type, proposed_fields, explanation")
      .single();
    if (proposalError) throw proposalError;

    return new Response(JSON.stringify({ proposal: proposalRow }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
