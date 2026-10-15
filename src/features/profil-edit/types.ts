import type { BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";

/**
 * ProfilEdit screen types — extracted from App.jsx's ProfilEdit component
 * props (line 2817) and its form shape.
 */
export interface ProfilEditForm {
  prenom: string;
  secteur: string;
  situationFamiliale: string;
  modeTravail: string;
  chargeMentale: string;
  sport: string;
  budget: string;
  alimentation: string;
  personnes: string;
  objectifCA: string;
  revenuActuel: string;
  tempsCuisine: string;
  aliments_eviter: string;
  caloriesCible: string;
  objectifNutrition: string;
}

export interface ProfilEditScreenProps {
  profile: BuildSystemPromptProfile & { equipements?: string };
  onSave: (profile: BuildSystemPromptProfile & { equipements: string }) => void | Promise<void>;
  onBack: () => void;
  loading?: boolean;
}
