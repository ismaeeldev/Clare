import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";
import { DEFAULT_PROFIL_FORM, type ProfilForm } from "@/features/onboarding/types";

/**
 * profileRepo — Step 3.2's mapping between the onboarding UI's flat
 * `ProfilForm` shape (French field names, preserved from the original
 * App.jsx per Step 1.3) and the real `profiles` table's grouped jsonb
 * columns (docs/05_DataModel.md §2.1: identity/business/sport/nutrition).
 * Every write goes through apiCall with no retry (these are writes, not
 * reads — a timeout retry on a write risks a duplicate/partial commit).
 */

export interface ProfileRow {
  user_id: string;
  onboarding_step: number;
  onboarding_complete: boolean;
  display_name: string | null;
  identity: { situationFamiliale: string } | null;
  business: { secteur: string; objectifCA: string; revenuActuel: string; modeTravail: string; chargeMentale: string } | null;
  sport: { jours: string; objectif: string | undefined } | null;
  nutrition: {
    alimentation: string;
    equipements: string;
    tempsCuisine: string;
    budget: string;
    personnes: string;
    aliments_eviter: string;
    caloriesCible: string;
    objectifNutrition: string;
  } | null;
  preferences: Record<string, unknown>;
}

/** Which onboarding step (0-indexed) writes which slice of the profile. */
export function stepToPartialRow(
  step: number,
  form: ProfilForm,
  equipements: string[]
): Partial<Pick<ProfileRow, "display_name" | "identity" | "business" | "sport" | "nutrition">> {
  switch (step) {
    case 0:
      return { display_name: form.prenom, identity: { situationFamiliale: form.situationFamiliale } };
    case 1:
      return {
        business: {
          secteur: form.secteur,
          objectifCA: form.objectifCA,
          revenuActuel: form.revenuActuel,
          modeTravail: form.modeTravail,
          chargeMentale: form.chargeMentale,
        },
      };
    case 2:
      return { sport: { jours: form.sport, objectif: form.objectifSport } };
    case 3:
    case 4:
      return {
        nutrition: {
          alimentation: form.alimentation,
          equipements: equipements.join(", "),
          tempsCuisine: form.tempsCuisine,
          budget: form.budget,
          personnes: form.personnes,
          aliments_eviter: form.aliments_eviter,
          caloriesCible: form.caloriesCible,
          objectifNutrition: form.objectifNutrition,
        },
      };
    default:
      return {};
  }
}

/**
 * Upserts the profile row for the current step: merges this step's fields
 * with the new onboarding_step marker. Uses upsert so step 0 (first ever
 * save) creates the row and every later step updates it — profiles.user_id
 * is the primary key (1:1 with auth.users), so this is always a single-row
 * upsert keyed on user_id.
 */
export async function saveOnboardingStep(
  userId: string,
  step: number,
  form: ProfilForm,
  equipements: string[]
): Promise<void> {
  const partial = stepToPartialRow(step, form, equipements);
  const { error } = await apiCall(() =>
    Promise.resolve(
      supabase.from("profiles").upsert({ user_id: userId, onboarding_step: step + 1, ...partial }, { onConflict: "user_id" })
    )
  );
  if (error) throw error;
}

export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await apiCall(() => Promise.resolve(supabase.from("profiles").update({ onboarding_complete: true }).eq("user_id", userId)));
  if (error) throw error;
}

/**
 * Loads the saved profile row (if any) and reconstructs a ProfilForm +
 * equipements[] + resume step, for onboarding resume-mid-flow and for
 * Settings > Edit Profile prefill. Returns null if no row exists yet
 * (brand-new user, step 0).
 */
export async function loadProfile(userId: string): Promise<{ step: number; form: Partial<ProfilForm>; equipements: string[]; onboardingComplete: boolean } | null> {
  const { data, error } = await apiCall(() => Promise.resolve(supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle()), {
    retryOnTimeout: true,
  });
  if (error) throw error;
  if (!data) return null;

  const row = data as ProfileRow;
  return {
    step: row.onboarding_step,
    onboardingComplete: row.onboarding_complete,
    equipements: row.nutrition?.equipements ? row.nutrition.equipements.split(", ").filter(Boolean) : [],
    form: {
      // Every field below (except objectifSport, genuinely optional in
      // ProfilForm) falls back to DEFAULT_PROFIL_FORM's "" rather than
      // undefined: a resuming user who only completed an earlier step has
      // whole jsonb groups (business/sport/nutrition) still null in the DB,
      // and spreading `undefined` over the form's default in
      // ProfilSetupScreen's resume effect previously left required string
      // fields as undefined — crashing canNext()'s `.trim()` calls and
      // flipping Input from controlled to uncontrolled.
      prenom: row.display_name ?? DEFAULT_PROFIL_FORM.prenom,
      situationFamiliale: row.identity?.situationFamiliale ?? DEFAULT_PROFIL_FORM.situationFamiliale,
      secteur: row.business?.secteur ?? DEFAULT_PROFIL_FORM.secteur,
      objectifCA: row.business?.objectifCA ?? DEFAULT_PROFIL_FORM.objectifCA,
      revenuActuel: row.business?.revenuActuel ?? DEFAULT_PROFIL_FORM.revenuActuel,
      modeTravail: row.business?.modeTravail ?? DEFAULT_PROFIL_FORM.modeTravail,
      chargeMentale: row.business?.chargeMentale ?? DEFAULT_PROFIL_FORM.chargeMentale,
      sport: row.sport?.jours ?? DEFAULT_PROFIL_FORM.sport,
      objectifSport: row.sport?.objectif,
      alimentation: row.nutrition?.alimentation ?? DEFAULT_PROFIL_FORM.alimentation,
      tempsCuisine: row.nutrition?.tempsCuisine ?? DEFAULT_PROFIL_FORM.tempsCuisine,
      budget: row.nutrition?.budget ?? DEFAULT_PROFIL_FORM.budget,
      personnes: row.nutrition?.personnes ?? DEFAULT_PROFIL_FORM.personnes,
      aliments_eviter: row.nutrition?.aliments_eviter ?? DEFAULT_PROFIL_FORM.aliments_eviter,
      caloriesCible: row.nutrition?.caloriesCible ?? DEFAULT_PROFIL_FORM.caloriesCible,
      objectifNutrition: row.nutrition?.objectifNutrition ?? DEFAULT_PROFIL_FORM.objectifNutrition,
    },
  };
}

/**
 * Writes every jsonb group at once (all 4 groups a full form covers) — used
 * by Settings > Edit Profile (3.2 task 6), which edits the whole profile in
 * one screen rather than step-by-step like onboarding. Accepts any object
 * with at least ProfilForm's fields (ProfilEditForm is a strict subset —
 * missing only objectifSport — so it satisfies this without change).
 */
export async function saveFullProfile(userId: string, form: ProfilForm, equipements: string[]): Promise<void> {
  const identity = stepToPartialRow(0, form, equipements);
  const business = stepToPartialRow(1, form, equipements);
  const sport = stepToPartialRow(2, form, equipements);
  const nutrition = stepToPartialRow(3, form, equipements);
  const { error } = await apiCall(() =>
    Promise.resolve(
      supabase
        .from("profiles")
        .upsert({ user_id: userId, ...identity, ...business, ...sport, ...nutrition }, { onConflict: "user_id" })
    )
  );
  if (error) throw error;
}

/**
 * Quiet hours (docs/05_DataModel.md §2.1: `profiles.quiet_hours`, default
 * `{"start":"21:00","end":"08:00"}`) — read/write for Settings (Step 7.6).
 * Also the exact field `scheduled-agents` (Step 6) reads to decide whether
 * "now" is inside a user's do-not-disturb window, so an edit made here is
 * respected by the next scheduled job run, not just displayed.
 */
export async function fetchQuietHours(userId: string): Promise<{ start: string; end: string }> {
  const { data, error } = await apiCall(() => Promise.resolve(supabase.from("profiles").select("quiet_hours").eq("user_id", userId).maybeSingle()));
  if (error) throw error;
  const qh = data?.quiet_hours as { start?: string; end?: string } | null;
  return { start: qh?.start ?? "21:00", end: qh?.end ?? "08:00" };
}

export async function saveQuietHours(userId: string, start: string, end: string): Promise<void> {
  const { error } = await apiCall(() =>
    Promise.resolve(supabase.from("profiles").update({ quiet_hours: { start, end } }).eq("user_id", userId))
  );
  if (error) throw error;
}

/**
 * Lieux (docs/05_DataModel.md §2.1: `profiles.preferences.saved_places`)
 * Synced cross-device via profiles.preferences JSON.
 */
export async function fetchLieux(userId: string): Promise<import("@/features/lieux/types").Lieu[]> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle()),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  return (prefs.saved_places as import("@/features/lieux/types").Lieu[]) || [];
}

export async function saveLieux(userId: string, lieux: import("@/features/lieux/types").Lieu[]): Promise<void> {
  const { data } = await apiCall(() =>
    Promise.resolve(supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle())
  );
  const currentPrefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  const updatedPrefs = { ...currentPrefs, saved_places: lieux };
  const { error } = await apiCall(() =>
    Promise.resolve(supabase.from("profiles").update({ preferences: updatedPrefs }).eq("user_id", userId))
  );
  if (error) throw error;
}

/**
 * Routine (docs/05_DataModel.md §2.1: `profiles.preferences.household_routine`)
 * Synced cross-device via profiles.preferences JSON.
 */
export async function fetchRoutine(userId: string): Promise<Required<import("@/lib/buildSystemPrompt").BuildSystemPromptRoutine>> {
  const { data, error } = await apiCall(
    () => Promise.resolve(supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle()),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  const routine = prefs.household_routine as Partial<import("@/lib/buildSystemPrompt").BuildSystemPromptRoutine> | undefined;
  return {
    quotidien: routine?.quotidien || [],
    hebdo: routine?.hebdo || [],
    mensuel: routine?.mensuel || [],
  };
}

export async function saveRoutine(
  userId: string,
  routine: Required<import("@/lib/buildSystemPrompt").BuildSystemPromptRoutine>
): Promise<void> {
  const { data } = await apiCall(() =>
    Promise.resolve(supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle())
  );
  const currentPrefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  const updatedPrefs = { ...currentPrefs, household_routine: routine };
  const { error } = await apiCall(() =>
    Promise.resolve(supabase.from("profiles").update({ preferences: updatedPrefs }).eq("user_id", userId))
  );
  if (error) throw error;
}
