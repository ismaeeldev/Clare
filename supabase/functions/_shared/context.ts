import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Builds the minimized context every chat-* Edge Function sends to Claude —
 * per docs/06_AIPromptRegistry.md §1 rule 4: "Only fetch and include the
 * specific fields a given prompt needs — never dump the user's entire
 * profile/journal history into every call." Deliberately fetches only the
 * compact fields chat-respond/chat-welcome's contracts (§2.1/§2.2) actually
 * name: today's appointments, revenue vs goal, fatigue signal, profile
 * display name.
 */
export interface CompactContext {
  displayName: string;
  todayAppointments: { title: string; time: string }[];
  revenueThisMonth: number;
  revenueGoal: number;
  fatigueSignal: boolean;
}

export async function buildCompactContext(client: SupabaseClient, userId: string): Promise<CompactContext> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [profileRes, appointmentsRes, financeRes, journalRes] = await Promise.all([
    client.from("profiles").select("display_name, business").eq("user_id", userId).maybeSingle(),
    client
      .from("calendar_items")
      .select("title, starts_at")
      .eq("user_id", userId)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", todayEnd.toISOString())
      .order("starts_at", { ascending: true }),
    client.from("finance_entries").select("amount, type").eq("user_id", userId).eq("type", "revenue").gte("entry_date", monthStart.toISOString().split("T")[0]),
    client.from("journal_entries").select("energy, mood").eq("user_id", userId).gte("entry_date", sevenDaysAgo.toISOString().split("T")[0]),
  ]);

  // profiles.business.objectifCA is the real onboarding field name (a string,
  // per ProfilForm) — this previously read a non-existent `revenue_goal` key,
  // so revenueGoal was silently always 0 for every user.
  const business = (profileRes.data?.business as { objectifCA?: string } | null) ?? null;

  return {
    displayName: profileRes.data?.display_name ?? "",
    todayAppointments: (appointmentsRes.data ?? []).map((a) => ({
      title: a.title as string,
      time: new Date(a.starts_at as string).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    })),
    revenueThisMonth: (financeRes.data ?? []).reduce((sum: number, r) => sum + Number(r.amount), 0),
    revenueGoal: Number(business?.objectifCA) || 0,
    // fatigue-signal per registry §2.8: deterministic count of "hard" days
    // (energy or mood <= 2) in the last 7 journal entries, never an LLM call.
    fatigueSignal: (journalRes.data ?? []).filter((j) => (j.energy ?? 3) <= 2 || (j.mood ?? 3) <= 2).length >= 3,
  };
}
