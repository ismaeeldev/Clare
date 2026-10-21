// Shared core of nutrition-calc's deterministic resolution logic — docs/06_
// AIPromptRegistry.md §2.9 / CLA-FR-014. Used both by nutrition-calc's own
// HTTP handler (client-facing) and by meal-plan-generate (in-process, same
// Deno isolate, to avoid an extra network hop for something that's already
// a same-runtime function call).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface IngredientInput {
  name: string;
  grams: number;
}

export interface FoodRow {
  id: string;
  source: "ciqual" | "off";
  name: string;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  dataset_version: string;
}

export interface ResolvedLine {
  name: string;
  grams: number;
  matched_food_id: string;
  matched_name: string;
  source: "ciqual" | "off";
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface UnresolvedLine {
  name: string;
  grams: number;
  reason: "not_found" | "incomplete_data";
}

export interface MealTotals {
  totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  resolved: ResolvedLine[];
  unresolved: UnresolvedLine[];
  generation_status: "ok" | "partial_unknown_items";
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    // œ/æ are single ligature codepoints, not precomposed accented
    // letters — NFD decomposition below only splits accents off letters
    // like é→e+´, it does NOT decompose a ligature into its two letters.
    // Left unhandled, the tokenizer's later `[^a-z0-9\s]` strip treats œ
    // as punctuation and silently drops it, mangling "œufs" into "ufs"
    // and "bœuf" into just "uf" (losing the leading "b" too, since the
    // dropped œ splits the word in two) — neither can ever match
    // CIQUAL's real "Oeuf cru"/"Boeuf..." entries (spelled with plain
    // letters, not the ligature). Found live: every meal plan's eggs and
    // beef were showing as unresolved ("not_found") despite both being
    // common CIQUAL entries, contributing to entire days totaling 0 kcal
    // when every ingredient in every meal happened to be similarly
    // affected.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const STOPWORDS = new Set(["de", "la", "le", "les", "du", "des", "et", "au", "aux", "sans", "avec", "a"]);

/**
 * Strips a trailing plural "s" (never "es" endings like "des"/"tomates" if
 * that would leave under 3 chars — avoids over-stemming short words).
 * Found necessary after a real bug in hand-verification: "Amandes"
 * (ingredient, plural) didn't token-match "Amande, avec peau..." (CIQUAL,
 * singular) at all, so the matcher fell through to a wrong compound-name
 * candidate that happened to also contain the literal word "amandes"
 * ("Croissant aux amandes, artisanal"). Not full linguistic stemming, just
 * enough to cross the singular/plural gap that's extremely common between
 * a free-text ingredient name and CIQUAL's singular official naming.
 */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map(stem)
  );
}

function scale(value: number | null, grams: number): number | null {
  if (value === null) return null;
  return (value * grams) / 100;
}

/**
 * Finds the best nutrition_foods match for a free-text ingredient name.
 * CIQUAL rows are preferred over OFF (lab-measured vs. community data).
 * Within a source: an exact normalized-name match wins outright; failing
 * that, every candidate whose full word set is contained in the
 * ingredient's word set (or vice versa) is a "full match", and among full
 * matches the one whose word count is CLOSEST to the ingredient's own word
 * count wins.
 *
 * That closest-length tiebreak is the important part, added after a real
 * bug found by hand-verifying a generated meal plan's calorie total
 * against CIQUAL (this session): a short ingredient like "Huile d'olive"
 * or "Amande" was matching a long compound product name that merely
 * happened to contain those words too — "Sardine, à l'huile d'olive,
 * appertisée, égouttée" (224 kcal/100g, wrong) instead of "Huile d'olive
 * vierge extra" (899 kcal/100g, correct); "Dessert au soja, aux amandes..."
 * (56 kcal/100g, wrong) instead of "Amande, avec peau, sans sel ajouté"
 * (615 kcal/100g, correct). Plain substring containment was tried even
 * earlier and rejected for a different reason: CIQUAL's long official
 * names never literally contain a plain phrase like "riz blanc cuit" as a
 * substring, so it matched nothing at all on real data.
 */
function findBestMatch(name: string, candidates: FoodRow[]): FoodRow | null {
  const targetTokens = tokenize(name);
  if (targetTokens.size === 0) return null;
  const target = normalize(name);
  const bySource = (source: "ciqual" | "off") => candidates.filter((c) => c.source === source);

  for (const source of ["ciqual", "off"] as const) {
    const pool = bySource(source);
    const exact = pool.find((c) => normalize(c.name) === target);
    if (exact) return exact;
  }

  for (const source of ["ciqual", "off"] as const) {
    const pool = bySource(source);
    const fullMatches: { candidate: FoodRow; headMatches: boolean; lengthDiff: number; hasKcal: boolean }[] = [];
    for (const candidate of pool) {
      const candidateTokens = tokenize(candidate.name);
      if (candidateTokens.size === 0) continue;
      const smaller = candidateTokens.size <= targetTokens.size ? candidateTokens : targetTokens;
      const larger = candidateTokens.size <= targetTokens.size ? targetTokens : candidateTokens;
      let containedCount = 0;
      for (const t of smaller) if (larger.has(t)) containedCount++;
      if (containedCount !== smaller.size) continue;
      const candidateHeadToken = [...candidateTokens][0];
      fullMatches.push({
        candidate,
        headMatches: candidateHeadToken !== undefined && targetTokens.has(candidateHeadToken),
        lengthDiff: Math.abs(candidateTokens.size - targetTokens.size),
        hasKcal: candidate.kcal_per_100g !== null,
      });
    }
    if (fullMatches.length === 0) continue;
    // Sort key, in priority order — each tier only breaks ties left by the
    // one before it:
    //  1. headMatches: does the candidate's first word (its most likely
    //     category head, e.g. "Amande" vs "Dragée") appear in the
    //     ingredient's own words? Prefers a raw ingredient over a
    //     prepared/branded product that merely mentions it in passing
    //     (found live: "Amandes" was matching "Dragée amande" — a candy —
    //     over "Amande, avec peau, sans sel ajouté" — plain almonds —
    //     because the candy's shorter name won on token-count alone).
    //  2. lengthDiff: closest word-count to the ingredient's own (found
    //     live: without this, a short ingredient matched a long compound
    //     dish name that merely contained the same words, e.g. "Huile
    //     d'olive" matching "Sardine, à l'huile d'olive, appertisée,
    //     égouttée" instead of "Huile d'olive vierge extra").
    //  3. hasKcal: a candidate with a real value beats one whose own kcal
    //     cell is null (found live: "Lait entier" tied against "Lait
    //     entier, cru" (null) before this, and null won by iteration
    //     order, silently turning a resolvable ingredient into
    //     "incomplete_data").
    // Still an imperfect heuristic without a real product database or
    // embeddings-based matching — CIQUAL frequently has no single
    // canonical entry for a bare ingredient name — but each tier here
    // fixes a specific wrong match found by hand-verifying a real
    // generated meal plan against CIQUAL in this session.
    fullMatches.sort((a, b) => {
      if (a.headMatches !== b.headMatches) return a.headMatches ? -1 : 1;
      if (a.lengthDiff !== b.lengthDiff) return a.lengthDiff - b.lengthDiff;
      if (a.hasKcal !== b.hasKcal) return a.hasKcal ? -1 : 1;
      return 0;
    });
    return fullMatches[0].candidate;
  }
  return null;
}

/**
 * Fetches the full nutrition_foods table, paginated. PostgREST caps a
 * single select at 1000 rows by default — with 3484+ CIQUAL rows alone, an
 * unpaginated select silently truncates the table (caught live in this
 * session: real foods came back "not found" purely because of row-order
 * luck against the cap). Always page through explicitly.
 */
async function fetchAllFoods(client: SupabaseClient): Promise<FoodRow[]> {
  const PAGE_SIZE = 1000;
  const foods: FoodRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await client
      .from("nutrition_foods")
      .select("id, source, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, dataset_version")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    foods.push(...((page ?? []) as FoodRow[]));
    if (!page || page.length < PAGE_SIZE) break;
  }
  return foods;
}

/**
 * Fetches nutrition_foods once — expose separately so a caller resolving
 * MANY meals in one request (meal-plan-generate: up to 15 meals per plan)
 * can fetch the table exactly once instead of once per meal. The original
 * version of meal-plan-generate called calcMealTotals (which fetches
 * internally) inside its per-meal loop — 15 full paginated re-fetches of
 * the same 3484+-row table for one plan generation, a real performance/
 * timeout risk found in this session's own adversarial review, not live-
 * observed as a failure yet but clearly wrong on inspection.
 */
export { fetchAllFoods };

export async function calcMealTotals(client: SupabaseClient, ingredients: IngredientInput[]): Promise<MealTotals> {
  const foods = await fetchAllFoods(client);
  return calcMealTotalsWithFoods(foods, ingredients);
}

export function calcMealTotalsWithFoods(foods: FoodRow[], ingredients: IngredientInput[]): MealTotals {
  const resolved: ResolvedLine[] = [];
  const unresolved: UnresolvedLine[] = [];

  for (const ing of ingredients) {
    const match = findBestMatch(ing.name, foods);
    if (!match) {
      unresolved.push({ name: ing.name, grams: ing.grams, reason: "not_found" });
      continue;
    }
    if (match.kcal_per_100g === null) {
      unresolved.push({ name: ing.name, grams: ing.grams, reason: "incomplete_data" });
      continue;
    }
    resolved.push({
      name: ing.name,
      grams: ing.grams,
      matched_food_id: match.id,
      matched_name: match.name,
      source: match.source,
      kcal: scale(match.kcal_per_100g, ing.grams),
      protein_g: scale(match.protein_per_100g, ing.grams),
      carbs_g: scale(match.carbs_per_100g, ing.grams),
      fat_g: scale(match.fat_per_100g, ing.grams),
    });
  }

  const totals = resolved.reduce(
    (acc, line) => ({
      kcal: acc.kcal + (line.kcal ?? 0),
      protein_g: acc.protein_g + (line.protein_g ?? 0),
      carbs_g: acc.carbs_g + (line.carbs_g ?? 0),
      fat_g: acc.fat_g + (line.fat_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  return {
    totals: {
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
    },
    resolved,
    unresolved,
    generation_status: unresolved.length === 0 ? "ok" : "partial_unknown_items",
  };
}
