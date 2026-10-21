import type { MealPlanRow } from "@/lib/nutritionRepo";

/**
 * Computes a shopping list from a week's meal_plans — pure derivation,
 * never stored (see nutritionRepo.ts's doc comment). Same-name ingredients
 * across different meals are summed into one line so the list reflects the
 * real total to buy, not one entry per meal.
 */
export interface ShoppingItem {
  key: string; // normalized name — stable identity for checked-state persistence
  name: string;
  grams: number;
  aisle: string;
  unresolvedCount: number; // how many of the summed occurrences had no nutrition_food_id match
}

// Strips a trailing plural "s" per word (never 3-char-or-shorter words,
// to avoid over-stemming) — same approach as _shared/nutritionCalc.ts's
// stem(), applied here for the same reason: the AI can spell the exact
// same ingredient inconsistently across different meals/days/plan
// generations (singular vs plural, "œufs" vs "Œufs" vs "oeufs"), and
// without this they'd each get a different dedup key, silently showing
// up as multiple separate shopping-list lines for what's actually one
// thing to buy — a client report of duplicate entries in the shopping
// list.
function stemWord(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    // œ/æ are single ligature codepoints, not precomposed accented
    // letters — NFD below doesn't decompose them, so left unhandled the
    // later non-alphanumeric strip treats œ as punctuation and mangles
    // "œufs" into "ufs" while a plain-spelled "Oeufs" normalizes
    // correctly to "oeufs" — two different keys for the same ingredient.
    // Same root cause already found and fixed in nutritionCalc.ts's own
    // normalize().
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map(stemWord)
    .join(" ");
}

// Keywords are written with accents for readability but matched against an
// accent-stripped ingredient name — normalizing them here at definition
// time (once) means an accented keyword like "épice" can never silently
// fail to match just because the ingredient's own accent got stripped
// first. (Found live: "épice" as written never matched anything, because
// normalizeKey(ingredient) strips accents but the raw keyword string
// didn't — only the redundant unaccented "epice" duplicate saved it. Every
// accented keyword in this table had the same latent bug.)
const AISLES: { name: string; keywords: string[] }[] = (
  [
    { name: "Fruits & légumes", keywords: ["tomate", "oignon", "carotte", "courgette", "poivron", "salade", "citron", "ail", "persil", "coriandre", "banane", "pomme", "orange", "concombre", "céleri", "navet", "olive"] },
    { name: "Viandes & poissons", keywords: ["poulet", "bœuf", "agneau", "mouton", "thon", "cabillaud", "poisson", "viande", "kefta", "sardine"] },
    { name: "Produits laitiers & œufs", keywords: ["lait", "fromage", "yaourt", "beurre", "œuf", "crème"] },
    { name: "Épicerie", keywords: ["riz", "semoule", "farine", "pâtes", "lentille", "pois chiche", "sucre", "miel", "huile", "sel", "épice", "cumin", "paprika", "cannelle"] },
    { name: "Pain & boulangerie", keywords: ["pain", "brick", "feuille"] },
    { name: "Fruits secs & autres", keywords: ["amande", "noix", "datte", "figue", "raisin"] },
  ] satisfies { name: string; keywords: string[] }[]
).map((aisle) => ({ name: aisle.name, keywords: aisle.keywords.map(normalizeKey) }));

function findAisle(name: string): string {
  const normalized = normalizeKey(name);
  for (const aisle of AISLES) {
    if (aisle.keywords.some((kw) => normalized.includes(kw))) return aisle.name;
  }
  return "Autres";
}

// AISLES above is already written in a deliberate, sensible order
// (produce, meat/fish, dairy, pantry, bakery, dried fruit/misc) — but the
// list was previously sorted by a.aisle.localeCompare(b.aisle), which
// discards that order for plain alphabetical sorting instead. French
// collation puts "Autres" (the catch-all for anything that matched no
// keyword — plausibly a meaningful fraction of items, given AI naming
// variance) before every real category, including "Viandes & poissons"
// and "Fruits & légumes" — unclassified items jumping to the very top of
// the list, ahead of the structured aisles, reads as genuinely "bizarre
// ranking" rather than a sensible shopping order. AISLE_ORDER restores
// the array's own intended order and places "Autres" explicitly last.
const AISLE_ORDER = new Map<string, number>(AISLES.map((a, i) => [a.name, i]));
function aisleRank(aisle: string): number {
  return AISLE_ORDER.get(aisle) ?? AISLES.length; // "Autres" (or any unknown aisle) sorts after every real category
}

export function buildShoppingList(mealPlans: MealPlanRow[]): ShoppingItem[] {
  const byKey = new Map<string, ShoppingItem>();
  for (const plan of mealPlans) {
    for (const ing of plan.ingredients) {
      const key = normalizeKey(ing.name);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.grams += ing.grams;
        if (!ing.nutrition_food_id) existing.unresolvedCount += 1;
      } else {
        byKey.set(key, {
          key,
          name: ing.name,
          grams: ing.grams,
          aisle: findAisle(ing.name),
          unresolvedCount: ing.nutrition_food_id ? 0 : 1,
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => aisleRank(a.aisle) - aisleRank(b.aisle) || a.name.localeCompare(b.name));
}

export function groupByAisle(items: ShoppingItem[]): { aisle: string; items: ShoppingItem[] }[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const list = groups.get(item.aisle) ?? [];
    list.push(item);
    groups.set(item.aisle, list);
  }
  return [...groups.entries()].map(([aisle, items]) => ({ aisle, items }));
}
