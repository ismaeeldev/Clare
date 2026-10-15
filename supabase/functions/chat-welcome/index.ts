// chat-welcome — docs/06_AIPromptRegistry.md §2.2.
// Trigger: opening a conversation for the first time in a session/day.
// Output: { welcome_text: string }.
// Guardrail: every claim in the welcome text must be traceable to a real
// field in the input context — no fabricated stats.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildCompactContext } from "../_shared/context.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { chatWelcomeOutputSchema } from "../_shared/schemas.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 300;

function buildSystemPrompt(mode: "matin" | "aprem" | "soir", ctx: Awaited<ReturnType<typeof buildCompactContext>>): string {
  return `Tu es Claré, l'assistant de vie personnel d'un(e) entrepreneur(se) indépendant(e) français(e). Génère un message d'accueil court (1-2 phrases), chaleureux et direct, jamais corporate.

Contexte réel de l'utilisateur (n'invente RIEN au-delà de ces faits) :
- Prénom : ${ctx.displayName || "non renseigné"}
- Moment de la journée : ${mode}
- Rendez-vous aujourd'hui : ${ctx.todayAppointments.length > 0 ? ctx.todayAppointments.map((a) => `${a.time} ${a.title}`).join(", ") : "aucun"}
- CA du mois : ${ctx.revenueThisMonth}€ ${ctx.revenueGoal > 0 ? `sur un objectif de ${ctx.revenueGoal}€` : "(pas d'objectif défini)"}
- Signal de fatigue détecté (3+ jours difficiles sur 7) : ${ctx.fatigueSignal ? "oui" : "non"}

RÈGLE STRICTE : chaque fait mentionné dans ton message doit venir directement de ce contexte. N'invente aucun chiffre, aucun rendez-vous, aucune statistique qui n'est pas listée ci-dessus.`;
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

    const body = await req.json().catch(() => ({}));
    const mode: "matin" | "aprem" | "soir" = ["matin", "aprem", "soir"].includes(body.mode) ? body.mode : "matin";

    const client = getUserClient(req)!;

    const { entitled } = await checkEntitlement(client, userId);
    if (!entitled) {
      return new Response(JSON.stringify({ error: "Un abonnement actif est requis pour utiliser cette fonctionnalité." }), {
        status: 402,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const ctx = await buildCompactContext(client, userId);

    const { result, usage } = await callClaudeStructured({
      systemPrompt: buildSystemPrompt(mode, ctx),
      messages: [{ role: "user", content: "Génère mon message d'accueil." }],
      toolName: "welcome_message",
      toolDescription: "Renvoie le message d'accueil personnalisé pour l'utilisateur.",
      outputSchema: {
        type: "object",
        properties: { welcome_text: { type: "string" } },
        required: ["welcome_text"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("chat-welcome", userId, usage);

    const parsed = chatWelcomeOutputSchema.parse(result);

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
