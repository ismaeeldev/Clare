// meal-plan-generate — docs/03_MasterPrompts.md §5.3 task 1.
// Claude suggests meal ideas/recipes in natural language, constrained by
// the user's diet/equipment/time/budget/allergies (from their profile) and
// this week's agenda — but the kcal/macro totals shown to the user are
// ALWAYS computed by nutrition-calc against real nutrition_foods rows,
// never trusted from Claude's own text (CLA-FR-014, docs/06_AIPromptRegistry.md
// §2.9). This function calls Claude once for the 5-day meal plan (names +
// ingredient lists only, no numbers), then calls nutrition-calc once per
// meal to get the real, traceable totals, then persists everything into
// meal_plans.
//
// Rules from docs/01_ScopeDocument.md §4.10: +200 kcal target on a day
// that has a sport-related agenda item; a day with 3+ appointments gets a
// "quick meals" instruction in the prompt for that day specifically.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { calcMealTotalsWithFoods, fetchAllFoods } from "../_shared/nutritionCalc.ts";
import { getWeekStart as getMondayOfCurrentWeek } from "../_shared/weekDates.ts";
import { mealPlanGenerateOutputSchema } from "../_shared/schemas.ts";

// Was 3000 — diagnostic logging against production showed successful
// calls already using 2790-2863 output tokens (93-95% of that cap). A
// client report of this function intermittently returning "days:
// expected array, received undefined" matches exactly what happens when
// Claude hits max_tokens mid-generation, before finishing the "days"
// array: the response gets cut off and the resulting tool_use input is
// incomplete. Bumped well above the observed near-saturation point.
const MAX_TOKENS = 6000;
// _shared/claude.ts's default 35s Claude-fetch timeout is tuned for
// chat-respond's much shorter replies — this function's own 5-day,
// 15-meal generation also intermittently hit that ceiling in live
// testing ("Claude n'a pas répondu dans le délai imparti (35s)"), the
// same bug class already fixed for prep-dimanche-brief. The client-side
// timeout here is 90s (NutritionScreen.tsx), so 70s leaves ~20s margin
// for the DB reads/writes and the per-meal nutrition-calc work that
// happens around this call.
const CLAUDE_TIMEOUT_MS = 70_000;
const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
// "course" deliberately excluded despite meaning "running" in a sport
// context — in French it much more commonly means "errand"/"grocery run"
// ("faire des courses"), and a false-positive sport-day here silently
// inflates someone's calorie target for no reason. "footing"/"jogging" are
// the safer, unambiguous French terms for a run.
const SPORT_KEYWORDS = ["sport", "muscu", "footing", "jogging", "running", "gym", "fitness", "yoga", "piscine", "vélo", "velo", "entraînement", "entrainement"];

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function toDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
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

    const { allowed } = await checkDailyMessageLimit(client, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Limite quotidienne atteinte." }), { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const { data: profileRow } = await client.from("profiles").select("nutrition").eq("user_id", userId).maybeSingle();
    const nutrition = (profileRow?.nutrition as Record<string, unknown> | null) ?? {};

    const weekStart = getMondayOfCurrentWeek();
    const weekEnd = addDays(weekStart, 5); // exclusive, Mon-Fri = 5 days

    const { data: agendaRows, error: agendaError } = await client
      .from("calendar_items")
      .select("title, starts_at")
      .eq("user_id", userId)
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .neq("status", "cancelled");
    if (agendaError) throw agendaError;

    // Per-day agenda signal: count of appointments (busy-day rule) and
    // whether any item looks sport-related (sport-day +200kcal rule) —
    // both deterministic, computed here in code, never left for the model
    // to infer from a vague description.
    const dayInfo = Array.from({ length: 5 }, (_, i) => {
      const dateKey = toDateKey(addDays(weekStart, i));
      const itemsThatDay = (agendaRows ?? []).filter((r) => String(r.starts_at).startsWith(dateKey));
      const isBusy = itemsThatDay.length >= 3;
      const isSportDay = itemsThatDay.some((r) => SPORT_KEYWORDS.some((kw) => String(r.title).toLowerCase().includes(kw)));
      return { dayOffset: i, dateKey, isBusy, isSportDay, appointmentCount: itemsThatDay.length };
    });

    const baseCalories = Number(nutrition.caloriesCible) || 2200;
    const dayRulesText = dayInfo
      .map((d, i) => {
        const dayName = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"][i];
        const notes: string[] = [];
        if (d.isSportDay) notes.push(`jour de sport détecté dans l'agenda → cible +200 kcal (soit ~${baseCalories + 200} kcal)`);
        if (d.isBusy) notes.push(`journée chargée (${d.appointmentCount} rendez-vous) → repas rapides à préparer uniquement`);
        return `${dayName} (${d.dateKey})${notes.length ? " — " + notes.join(", ") : ""}`;
      })
      .join("\n");

    const systemPrompt = `Tu es un nutritionniste IA pour Claré. Réponds via l'outil fourni, jamais en texte libre.

Profil : régime ${nutrition.alimentation || "standard"}, ${nutrition.personnes || 1} personne(s), équipements : ${nutrition.equipements || "four, plaques"}, temps cuisine : ${nutrition.tempsCuisine || "normal"}, objectif : ${nutrition.objectifNutrition || "maintien"}, cible : ${baseCalories} kcal/jour, budget courses : ${nutrition.budget || "80"}€/semaine.

RÈGLE ABSOLUE — respecte strictement le régime alimentaire indiqué (ex: si "halal", aucun porc/alcool/produit non-halal ; si "végétarien", aucune viande/poisson ; si "sans gluten", aucun ingrédient contenant du gluten). Une violation de cette règle est inacceptable.

Pour chaque repas, donne uniquement le nom du plat et la liste des ingrédients avec leur quantité en grammes — NE calcule et N'invente AUCUN chiffre de calories/macros toi-même, un système déterministe s'en charge séparément à partir de tes ingrédients.`;

    const msg = `Génère un plan de 5 repas/jour (petit-déjeuner, déjeuner, dîner) pour la semaine, jour par jour, avec ingrédients précis en grammes.

Contraintes par jour :
${dayRulesText}`;

    const mealSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, grams: { type: "number", exclusiveMinimum: 0 } },
            required: ["name", "grams"],
          },
        },
      },
      required: ["title", "ingredients"],
    };
    const daySchema = {
      type: "object",
      properties: {
        day_offset: { type: "number" },
        breakfast: mealSchema,
        lunch: mealSchema,
        dinner: mealSchema,
      },
      required: ["day_offset", "breakfast", "lunch", "dinner"],
    };

    const { result, usage } = await callClaudeStructured({
      systemPrompt,
      messages: [{ role: "user", content: msg }],
      toolName: "meal_plan_suggestions",
      toolDescription: "Génère les suggestions de repas (noms + ingrédients, sans chiffres calculés) pour 5 jours.",
      outputSchema: {
        type: "object",
        properties: { days: { type: "array", items: daySchema } },
        required: ["days"],
      },
      maxTokens: MAX_TOKENS,
      timeoutMs: CLAUDE_TIMEOUT_MS,
    });
    logTokenUsage("meal-plan-generate", userId, usage);

    const days = mealPlanGenerateOutputSchema.parse(result).days;
    if (days.length === 0) {
      // Observed live (this session): Claude occasionally returns a
      // tool_use with an empty/missing `days` array on the first attempt
      // for this particular multi-day, constraint-heavy prompt, succeeding
      // cleanly on retry with no other change — a genuine intermittent
      // model behavior, not a deterministic bug in this function. The
      // client's retry/error-state UI (5.3 task 2) is the intended
      // mitigation; this function itself just surfaces a clear error
      // rather than silently returning an empty plan.
      throw new Error("Claude n'a retourné aucune suggestion de repas — réessaie");
    }

    // Every meal's real numbers come from nutrition-calc's shared core,
    // called here in-process (same Deno runtime, same auth context) rather
    // than trusting anything from the Claude response above. Fetch
    // nutrition_foods ONCE for the whole plan (up to 15 meals) rather than
    // once per meal — the original version called the fetch-per-call
    // calcMealTotals inside the per-meal loop below, meaning up to 15 full
    // paginated re-fetches of the same 3484+-row table for a single plan
    // generation. Caught in adversarial review, fixed before it caused a
    // real timeout.
    const foods = await fetchAllFoods(client);

    const mealPlanRows: {
      user_id: string;
      week_start: string;
      day: string;
      meal_slot: string;
      title: string;
      ingredients: unknown;
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
      calculation_source: string;
      calculation_version: string;
      generation_status: string;
    }[] = [];

    for (const day of days) {
      const info = dayInfo[day.day_offset];
      if (!info) continue;
      for (const slot of MEAL_SLOTS) {
        const meal = day[slot];
        if (!meal || !meal.ingredients?.length) continue;
        // Defense-in-depth: the tool schema declares `grams` as a number
        // but doesn't (and can't, via JSON Schema alone) enforce it's
        // positive — a 0/negative/non-finite value from Claude would
        // silently corrupt the calorie math or produce a nonsense
        // persisted row. Drop only the bad ingredient lines rather than
        // failing the whole meal.
        const validIngredients = meal.ingredients.filter((ing) => typeof ing.name === "string" && ing.name.trim() && Number.isFinite(ing.grams) && ing.grams > 0);
        if (validIngredients.length === 0) continue;
        const calc = calcMealTotalsWithFoods(foods, validIngredients);
        const sources = new Set(calc.resolved.map((r) => r.source));
        const calculationSource = sources.size === 0 ? null : sources.size > 1 ? "mixed" : [...sources][0];
        mealPlanRows.push({
          user_id: userId,
          week_start: toDateKey(weekStart),
          day: info.dateKey,
          meal_slot: slot,
          title: meal.title,
          ingredients: validIngredients.map((ing) => {
            const match = calc.resolved.find((r) => r.name === ing.name);
            return { name: ing.name, grams: ing.grams, nutrition_food_id: match?.matched_food_id ?? null };
          }),
          calories: calc.unresolved.length === validIngredients.length ? null : calc.totals.kcal,
          protein_g: calc.unresolved.length === validIngredients.length ? null : calc.totals.protein_g,
          carbs_g: calc.unresolved.length === validIngredients.length ? null : calc.totals.carbs_g,
          fat_g: calc.unresolved.length === validIngredients.length ? null : calc.totals.fat_g,
          calculation_source: calculationSource,
          calculation_version: "nutrition-calc-v1",
          generation_status: calc.unresolved.length === 0 ? "ok" : "partial_unknown_items",
        });
      }
    }

    if (mealPlanRows.length === 0) throw new Error("Aucun repas n'a pu être calculé");

    // A new plan supersedes any prior rows for this exact week. Runs via the
    // replace_week_meal_plans RPC (migration 0015) so delete+insert is one
    // atomic transaction — a separate delete-then-insert here previously
    // risked silently wiping the week's plan if the insert failed right
    // after the delete succeeded.
    const { data: inserted, error: replaceError } = await client.rpc("replace_week_meal_plans", {
      p_user_id: userId,
      p_week_start: toDateKey(weekStart),
      p_rows: mealPlanRows,
    });
    if (replaceError) throw replaceError;

    return new Response(JSON.stringify({ meal_plans: inserted, week_start: toDateKey(weekStart) }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
