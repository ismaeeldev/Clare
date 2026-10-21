// prep-dimanche-brief — server-side replacement for PrepDimancheScreen's
// 2-call weekly brief generation, mapping to
// docs/06_AIPromptRegistry.md §2.5 (weekly-summary) + §2.6
// (weekly-plan-generate) combined into one function since the original
// client-side flow always calls both together and merges their output.
//
// coherence score and "projets négligés" are deterministic calculations
// (registry §2.10 — coherence-score is explicitly "pure calculation, no
// AI") — computed client-side (calculerCoherence.ts, unchanged) and passed
// in as request body fields, never recomputed or invented here.
//
// Guardrail per §2.6: failure at this step must not overwrite the
// previously accepted weekly_plans row — this function still only returns
// the generated brief and never writes weekly_plans itself; the explicit
// user Accept action in PrepDimancheScreen.tsx (via weeklyPlanRepo.ts,
// Step 6) is what persists it, so a failed/retried generation here can
// never touch the previously accepted row.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { prepDimancheSummarySchema, prepDimanchePlanSchema } from "../_shared/schemas.ts";

const MAX_TOKENS_SUMMARY = 2000;
const MAX_TOKENS_PLAN = 2500;
// _shared/claude.ts's default 35s Claude-fetch timeout is tuned for
// chat-respond's much shorter single-turn replies (45s client timeout,
// 10s margin). This function's own prompts — full user context plus a
// 7-day 1-3-5 task plan — are documented below to legitimately take
// 20-40s each, routinely exceeding that 35s default and failing on every
// real attempt (confirmed by a client report: "Claude n'a pas répondu
// dans le délai imparti (35s)"). The client's own timeout here is 60s
// (PrepDimancheScreen.tsx), so 48s leaves ~12s margin for buildFullContext's
// DB reads and response serialization to still finish and return a clean
// result/error before the client gives up — same margin principle as the
// 35s default, just sized for this function's real budget instead.
const CLAUDE_TIMEOUT_MS = 48_000;

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
    const form = (body.form ?? {}) as { chargeSemaine?: string; objectifPrincipal?: string; contraintes?: string; sportPrevu?: string };
    const projetsNegliges: { projet: string; joursDepuis: number }[] = Array.isArray(body.projetsNegliges) ? body.projetsNegliges : [];
    const coherenceGlobal: number = Number.isFinite(body.coherenceGlobal) ? body.coherenceGlobal : 0;
    const routineInput = (body.routine ?? {}) as { quotidien?: string[]; hebdo?: string[] };

    const ctx = await buildFullContext(client, userId);
    const contexte = `Charge : ${form.chargeSemaine || "normale"}. Objectif : ${form.objectifPrincipal || "non précisé"}. Contraintes : ${form.contraintes || "aucune"}. Sport prévu : ${form.sportPrevu || ctx.profile.sport || "non précisé"}. Agenda : ${ctx.agenda.map((e) => `${e.date} ${e.heure} ${e.titre}`).join(", ") || "vide"}. Équipements : ${ctx.profile.equipements || "four"}. Temps cuisine : ${ctx.profile.tempsCuisine || "normal"}. Routine hebdo active : ${routineInput.hebdo?.join(", ") || "aucune"}. Routine quotidienne : ${routineInput.quotidien?.join(", ") || "aucune"}.`;

    const basePrompt = buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux);

    const summaryPrompt =
      basePrompt +
      `\nMIROIR : ${projetsNegliges.map((p) => `${p.projet} il y a ${p.joursDepuis}j`).join(", ") || "aucun"}. Score cohérence : ${coherenceGlobal}/100.\nRéponds via l'outil fourni.`;

    const planPrompt =
      basePrompt +
      `\nRÈGLE : 1 grande tâche + 3 moyennes + 5 petites (tague (2min) si moins de 2 minutes) par jour, 7 jours exactement. Intègre la routine quotidienne (${routineInput.quotidien?.join(", ") || "aucune"}) dans les taches_5. Répartis la routine hebdo (${routineInput.hebdo?.join(", ") || "aucune"}) sur les bons jours.`;

    // The two Claude calls are fully independent (different prompts/tools/
    // outputs, neither depends on the other's result) — they MUST run via
    // Promise.all, not sequential awaits. The UI's own copy ("2 analyses en
    // parallèle — 20 à 40 secondes", PrepDimancheScreen.tsx) already
    // promises this; a prior sequential version silently doubled real
    // latency (each call independently takes ~20-40s, confirmed live) to
    // 60-80s+, which blew past the client's 60s callEdgeFunction timeout
    // and made this screen fail on every real attempt. Caught live in this
    // session: 3 consecutive manual generations all hit the client timeout
    // before this fix; none did after.
    const [summaryCall, planCall] = await Promise.all([
      callClaudeStructured({
        systemPrompt: summaryPrompt,
        messages: [{ role: "user", content: `Prépare ma semaine. ${contexte}` }],
        toolName: "weekly_summary",
        toolDescription: "Renvoie le résumé de préparation de semaine.",
        outputSchema: {
          type: "object",
          properties: {
            resume: { type: "string" },
            priorites: { type: "array", items: { type: "string" } },
            miroir_projets: { type: "string" },
            ne_pas_faire: { type: "array", items: { type: "string" } },
            finances: { type: "string" },
            motivation: { type: "string" },
            courses: { type: "array", items: { type: "string" } },
          },
          required: ["resume"],
        },
        maxTokens: MAX_TOKENS_SUMMARY,
        timeoutMs: CLAUDE_TIMEOUT_MS,
      }),
      callClaudeStructured({
        systemPrompt: planPrompt,
        messages: [{ role: "user", content: `Génère le planning 1-3-5 pour ma semaine. ${contexte}` }],
        toolName: "weekly_plan",
        toolDescription: "Renvoie le planning 1-3-5 jour par jour pour la semaine.",
        outputSchema: {
          type: "object",
          properties: {
            jours: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  jour: { type: "string" },
                  date: { type: "string" },
                  alerte: { type: ["string", "null"] },
                  conseil: { type: "string" },
                  tache_1: { type: "string" },
                  taches_3: { type: "array", items: { type: "string" } },
                  taches_5: { type: "array", items: { type: "string" } },
                  repasMidi: { type: "string" },
                  repasSoir: { type: "string" },
                },
                required: ["jour", "date"],
              },
            },
          },
          required: ["jours"],
        },
        maxTokens: MAX_TOKENS_PLAN,
        timeoutMs: CLAUDE_TIMEOUT_MS,
      }),
    ]);
    logTokenUsage("prep-dimanche-brief:summary", userId, summaryCall.usage);
    logTokenUsage("prep-dimanche-brief:plan", userId, planCall.usage);
    const summaryOutput = prepDimancheSummarySchema.parse(summaryCall.result);
    const planOutput = prepDimanchePlanSchema.parse(planCall.result);

    return new Response(JSON.stringify({ ...summaryOutput, jours: planOutput.jours }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
