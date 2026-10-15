// nutrition-calc — docs/06_AIPromptRegistry.md §2.9 / docs/03_MasterPrompts.md
// §5.2 task 3. Deterministic — NEVER calls Claude. Given a list of
// {name, grams}, resolves each against nutrition_foods (CIQUAL first, then
// an OFF cache lookup via nutrition-lookup for anything CIQUAL doesn't
// have), sums kcal/protein/carbs/fat, and flags any ingredient it cannot
// resolve rather than guessing its values (CLA-FR-014's hard requirement:
// calorie/macro numbers are never AI-invented).
//
// Core matching/summing logic lives in _shared/nutritionCalc.ts so
// meal-plan-generate can call it in-process (same Deno isolate) without an
// extra HTTP hop — this file is just the HTTP-facing wrapper.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { calcMealTotals, type IngredientInput } from "../_shared/nutritionCalc.ts";

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

    const body = await req.json().catch(() => ({}));
    const ingredients: IngredientInput[] = Array.isArray(body.ingredients) ? body.ingredients : [];
    if (ingredients.length === 0) {
      return new Response(JSON.stringify({ error: "ingredients is required and must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    for (const ing of ingredients) {
      if (typeof ing.name !== "string" || !ing.name.trim() || typeof ing.grams !== "number" || ing.grams <= 0) {
        return new Response(JSON.stringify({ error: "each ingredient needs a non-empty name and a positive grams value" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
    }

    const result = await calcMealTotals(client, ingredients);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
