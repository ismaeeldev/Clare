import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgendaItem, Finances, JournalEntry, Lieu, Profile } from "./buildSystemPrompt.ts";

/**
 * Full-context fetcher for the non-chat AI functions (Focus/Idees/
 * Nutrition/PrepDimanche/Stats) — these need the same broad profile/
 * journal/agenda/finances snapshot buildSystemPrompt.ts's client-side
 * predecessor used to build client-side, now fetched server-side instead.
 * Unlike chat's compact context (§1 rule 4's minimized-context guidance),
 * these prompts genuinely need the fuller picture (that's what the
 * original client-side calls did too) — not a scope violation, just a
 * different prompt's actual requirement.
 */
export interface FullContext {
  profile: Profile;
  journal: JournalEntry[];
  agenda: AgendaItem[];
  finances: Finances;
  lieux: Lieu[];
}

export async function buildFullContext(client: SupabaseClient, userId: string): Promise<FullContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const sevenDaysAhead = new Date();
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

  const [profileRes, journalRes, agendaRes, revenueRes, expenseRes] = await Promise.all([
    client.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    client
      .from("journal_entries")
      .select("entry_date, energy, mood, workout_status, revenue, expenses, text_content")
      .eq("user_id", userId)
      .gte("entry_date", sevenDaysAgo.toISOString().split("T")[0])
      .order("entry_date", { ascending: true }),
    client
      .from("calendar_items")
      .select("title, starts_at")
      .eq("user_id", userId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", sevenDaysAhead.toISOString())
      .order("starts_at", { ascending: true }),
    client.from("finance_entries").select("amount").eq("user_id", userId).eq("type", "revenue").gte("entry_date", monthStart.toISOString().split("T")[0]),
    client.from("finance_entries").select("amount").eq("user_id", userId).eq("type", "expense").gte("entry_date", monthStart.toISOString().split("T")[0]),
  ]);

  const p = profileRes.data as Record<string, unknown> | null;
  const business = (p?.business as Record<string, unknown> | null) ?? null;
  const sport = (p?.sport as Record<string, unknown> | null) ?? null;
  const nutrition = (p?.nutrition as Record<string, unknown> | null) ?? null;

  const profile: Profile = {
    prenom: (p?.display_name as string) ?? undefined,
    secteur: business?.secteur as string | undefined,
    situationFamiliale: (p?.identity as Record<string, unknown> | null)?.situationFamiliale as string | undefined,
    modeTravail: business?.modeTravail as string | undefined,
    chargeMentale: business?.chargeMentale as string | undefined,
    sport: sport?.jours as string | undefined,
    budget: nutrition?.budget as string | undefined,
    alimentation: nutrition?.alimentation as string | undefined,
    personnes: nutrition?.personnes as string | undefined,
    revenuActuel: business?.revenuActuel as string | undefined,
    objectifCA: business?.objectifCA as string | undefined,
    equipements: nutrition?.equipements as string | undefined,
    tempsCuisine: nutrition?.tempsCuisine as string | undefined,
    aliments_eviter: nutrition?.aliments_eviter as string | undefined,
    objectifNutrition: nutrition?.objectifNutrition as string | undefined,
    caloriesCible: nutrition?.caloriesCible as string | undefined,
  };

  const journal: JournalEntry[] = (journalRes.data ?? []).map((j) => ({
    date: j.entry_date as string,
    energie: j.energy as number | undefined,
    humeur: j.mood as number | undefined,
    sport: j.workout_status === "done" ? "oui" : j.workout_status === "light" ? "léger" : "non",
    revenus: j.revenue as number | undefined,
    depenses: j.expenses as number | undefined,
    texte: j.text_content as string | undefined,
  }));

  const agenda: AgendaItem[] = (agendaRes.data ?? []).map((a) => {
    const d = new Date(a.starts_at as string);
    return {
      date: d.toISOString().split("T")[0],
      heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      titre: a.title as string,
      type: "rdv",
    };
  });

  const revenus = (revenueRes.data ?? []).reduce((s: number, r) => s + Number(r.amount), 0);
  const depenses = (expenseRes.data ?? []).reduce((s: number, r) => s + Number(r.amount), 0);

  return { profile, journal, agenda, finances: { revenus, depenses }, lieux: [] };
}
