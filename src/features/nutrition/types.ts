import type { BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import type { CoherenceJournalEntry } from "@/lib/calculerCoherence";

/**
 * Nutrition screen types — extracted from App.jsx's Nutrition component
 * props (line 2456) and its AI plan/recette/favoris JSON shapes. `profile`
 * stays as an optional display-only prop (header subtitle, calorie-target
 * banner, budget badge); `journal` stays for the real "recent meals"
 * display list.
 *
 * Step 5.3 replaced the "plan" tab's old AI-estimated nutrition-plan Edge
 * Function (deleted) with the deterministic meal-plan-generate +
 * nutrition-calc pipeline (real, traceable, source-attributed kcal/macros
 * against meal_plans — see nutritionRepo.ts). "recette" still uses
 * nutrition-recette (its own AI-estimated-calories limitation, flagged in
 * that function's own code comment, is unchanged by this step).
 */
export type NutritionTab = "plan" | "recette" | "favoris";

export interface NutritionRecette {
  nom?: string;
  temps?: string;
  calories?: string;
  ingredients?: string[];
  etapes?: string[];
  erreur?: string;
}

export interface NutritionFavori {
  id: number;
  titre: string;
  contenu: NutritionRecette;
  date: string;
}

export interface NutritionJournalEntry extends CoherenceJournalEntry {
  repas?: string;
}

export interface NutritionScreenProps {
  userId: string;
  profile?: BuildSystemPromptProfile;
  journal?: NutritionJournalEntry[];
}
