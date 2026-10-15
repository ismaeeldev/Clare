import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";

/**
 * nutritionRepo — Step 5.3's data layer for `meal_plans` and
 * `shopping_list_checks` (docs/05_DataModel.md §2.7, migration
 * 0011_shopping_list_checked.sql). The shopping list itself is a pure
 * client-side derivation from a week's meal_plans.ingredients — grouped by
 * a simple keyword-based aisle heuristic — never its own stored table, so
 * it can never drift out of sync with the plan it's computed from. Only
 * the per-item checked state persists.
 */
export interface MealPlanRow {
  id: string;
  user_id: string;
  week_start: string;
  day: string;
  meal_slot: "breakfast" | "lunch" | "dinner";
  title: string;
  ingredients: { name: string; grams: number; nutrition_food_id: string | null }[];
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  calculation_source: "ciqual" | "off" | "mixed" | null;
  calculation_version: string | null;
  generation_status: "ok" | "partial_unknown_items" | "failed";
  created_at: string;
}

export async function fetchMealPlan(userId: string, weekStart: string): Promise<MealPlanRow[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase.from("meal_plans").select("*").eq("user_id", userId).eq("week_start", weekStart).order("day", { ascending: true })
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data ?? []) as MealPlanRow[];
}

export interface ShoppingCheckRow {
  item_key: string;
  checked: boolean;
}

export async function fetchShoppingChecks(userId: string, weekStart: string): Promise<Map<string, boolean>> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(supabase.from("shopping_list_checks").select("item_key, checked").eq("user_id", userId).eq("week_start", weekStart)),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  const map = new Map<string, boolean>();
  for (const row of (data ?? []) as ShoppingCheckRow[]) map.set(row.item_key, row.checked);
  return map;
}

/** Toggles one shopping-list item's checked state — upserts so the first tap on a never-seen item creates its row. */
export async function toggleShoppingCheck(userId: string, weekStart: string, itemKey: string, checked: boolean): Promise<void> {
  const { error } = await apiCall(() =>
    Promise.resolve(
      supabase.from("shopping_list_checks").upsert({ user_id: userId, week_start: weekStart, item_key: itemKey, checked }, { onConflict: "user_id,week_start,item_key" })
    )
  );
  if (error) throw error;
}
