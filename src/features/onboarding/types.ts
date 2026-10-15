/**
 * ProfilForm — shape extracted from App.jsx ProfilSetup's useState(form)
 * initializer (lines 603-608). Field names preserved exactly (French,
 * matching the original) since Step 2's real Supabase schema mapping will
 * need to trace back to these.
 */
export interface ProfilForm {
  prenom: string;
  secteur: string;
  situationFamiliale: string;
  modeTravail: string;
  sport: string;
  objectifSport?: string;
  budget: string;
  alimentation: string;
  personnes: string;
  objectifCA: string;
  revenuActuel: string;
  chargeMentale: string;
  tempsCuisine: string;
  aliments_eviter: string;
  caloriesCible: string;
  objectifNutrition: string;
}

export const DEFAULT_PROFIL_FORM: ProfilForm = {
  prenom: "",
  secteur: "",
  situationFamiliale: "seul",
  modeTravail: "mix",
  sport: "",
  budget: "",
  alimentation: "standard",
  personnes: "1",
  objectifCA: "",
  revenuActuel: "",
  chargeMentale: "organisation",
  tempsCuisine: "normal",
  aliments_eviter: "",
  caloriesCible: "",
  objectifNutrition: "maintien",
};
