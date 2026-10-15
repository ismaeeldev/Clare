// stats-bilan — server-side replacement for StatsScreen's weekly bilan
// generation call. Not a dedicated docs/06_AIPromptRegistry.md entry —
// closest match is §2.10 (coherence-score): the coherence numbers
// themselves are deterministic (calculerCoherence.ts, unchanged, computed
// client-side and passed in), only the natural-language commentary is AI,
// matching the registry's explicit rule that AI may summarize deterministic
// numbers but never generate them.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { statsBilanOutputSchema } from "../_shared/schemas.ts";

const MAX_TOKENS = 1500;

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
    const coherence = (body.coherence ?? {}) as { global?: number; axes?: { nom: string; score: number; detail: string }[] };
    const stats = (body.stats ?? {}) as {
      sportCount?: number;
      avgEnergie?: string;
      avgHumeur?: string;
      totalDep?: number;
      totalRev?: number;
      totalFocusMin?: number;
      focusSessionsCount?: number;
      projets?: [string, number][];
    };

    const ctx = await buildFullContext(client, userId);
    const systemPrompt =
      buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux) +
      `

DONNÉES FACTUELLES DE COHÉRENCE (calculées, pas à inventer) :
Score global : ${coherence.global ?? 0}/100
${(coherence.axes ?? []).map((a) => `- ${a.nom} : ${a.score}/100 (${a.detail})`).join("\n")}
Utilise ces vrais chiffres dans ton analyse, ne les réinvente jamais.`;

    const msg = `Génère mon bilan de la semaine. Données réelles :
Sport : ${stats.sportCount ?? 0}/7 jours actifs
Énergie moyenne : ${stats.avgEnergie ?? "-"}/5
Humeur moyenne : ${stats.avgHumeur ?? "-"}/5
Dépenses : ${stats.totalDep ?? 0}€
Revenus : ${stats.totalRev ?? 0}€
Temps de focus profond : ${stats.totalFocusMin ?? 0}min sur ${stats.focusSessionsCount ?? 0} sessions
Projets travaillés : ${(stats.projets ?? []).map(([nom, c]) => `${nom} (${c}j)`).join(", ") || "non renseigné"}`;

    const { result, usage } = await callClaudeStructured({
      systemPrompt,
      messages: [{ role: "user", content: msg }],
      toolName: "weekly_bilan",
      toolDescription: "Renvoie le bilan de la semaine.",
      outputSchema: {
        type: "object",
        properties: {
          note: { type: "string" },
          resume: { type: "string" },
          points_forts: { type: "array", items: { type: "string" } },
          points_attention: { type: "array", items: { type: "string" } },
          priorites_semaine_prochaine: { type: "array", items: { type: "string" } },
          motivation: { type: "string" },
        },
        required: ["resume"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("stats-bilan", userId, usage);
    const bilan = statsBilanOutputSchema.parse(result);

    return new Response(JSON.stringify(bilan), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
