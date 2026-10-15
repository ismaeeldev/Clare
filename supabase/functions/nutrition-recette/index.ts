// nutrition-recette — server-side replacement for NutritionScreen's
// single-recipe generation call. Same calorie-estimate caveat as
// nutrition-plan (see that function's header comment) — not fixed here,
// out of Step 4.2's scope.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { nutritionRecetteOutputSchema } from "../_shared/schemas.ts";

const MAX_TOKENS = 1200;

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
    const envie: string = typeof body.envie === "string" ? body.envie : "";
    if (!envie.trim()) {
      return new Response(JSON.stringify({ error: "envie is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const ctx = await buildFullContext(client, userId);
    const systemPrompt =
      buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux) +
      `

Réponds via l'outil fourni avec une recette précise adaptée aux équipements et au temps disponible du profil.`;

    const msg = `J'ai envie de : "${envie}". Propose-moi UNE recette précise adaptée à mes équipements (${ctx.profile.equipements || "four, plaques"}) et mon temps dispo (${ctx.profile.tempsCuisine || "normal"}). Régime : ${ctx.profile.alimentation || "standard"}. Personnes : ${ctx.profile.personnes || 1}.
Objectif nutritionnel : ${ctx.profile.objectifNutrition || "maintien"}. Cible calorique/jour : ${ctx.profile.caloriesCible || "non précisée"}.`;

    const { result, usage } = await callClaudeStructured({
      systemPrompt,
      messages: [{ role: "user", content: msg }],
      toolName: "recipe",
      toolDescription: "Renvoie une recette précise adaptée aux contraintes de l'utilisateur.",
      outputSchema: {
        type: "object",
        properties: {
          nom: { type: "string" },
          temps: { type: "string" },
          calories: { type: "string" },
          ingredients: { type: "array", items: { type: "string" } },
          etapes: { type: "array", items: { type: "string" } },
        },
        required: ["nom", "ingredients", "etapes"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("nutrition-recette", userId, usage);
    const recette = nutritionRecetteOutputSchema.parse(result);

    return new Response(JSON.stringify(recette), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
