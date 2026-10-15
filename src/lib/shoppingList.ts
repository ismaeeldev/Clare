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

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
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
  return [...byKey.values()].sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
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
