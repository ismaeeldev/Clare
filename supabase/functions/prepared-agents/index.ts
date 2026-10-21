// prepared-agents — docs/06_AIPromptRegistry.md §2.7 ("Claré has prepared"
// engine). Trigger: app-open (called once from the client on mount, NOT
// cron — see 03_MasterPrompts.md §6.2 task 2). Runs all three approved
// agents (meal/revenue/sport) in one call since they share the same
// trigger and the client only needs one round-trip on open.
//
// Shared guardrail across all three (registry §2.7): each must cite the
// specific source rows it used — no proposal without traceable input
// data. If there's no real signal, the agent simply produces nothing for
// that slot (Home shows the empty state, 04_ApplicationFlow.md §2.3) —
// never a fabricated proposal on a quiet day.
//
// meal-agent pulls from EXISTING meal_plans rows (never invents a meal) —
// output feeds a create-style confirm-to-commit flow, same contract as
// every other action_type.
// revenue-agent only runs when the user is behind their monthly goal —
// produces exactly 3 concrete actions (not vague advice).
// sport-agent produces a next-session proposal traceable to real past
// journal workout entries.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";
import { revenueCatchupPlanSchema, sportSessionPlanSchema } from "../_shared/schemas.ts";
import { parisDateParts } from "../_shared/dateContext.ts";

const MAX_TOKENS = 1200;

// Was `new Date().toISOString().split("T")[0]` — UTC, which is 1-2 hours
// behind Europe/Paris and would scope this function's daily idempotency
// key to the wrong calendar day for that window each night (see
// dateContext.ts for the full explanation of this bug class, caught via
// a client report about AI-resolved dates).
function todayKey(): string {
  return parisDateParts().iso;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const client = getUserClient(req)!;

    const { entitled } = await checkEntitlement(client, userId);
    if (!entitled) {
      return new Response(JSON.stringify({ error: "Un abonnement actif est requis pour utiliser cette fonctionnalité." }), {
        status: 402,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { allowed } = await checkDailyMessageLimit(client, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Limite quotidienne atteinte." }), { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Each proposal is written to action_proposals so the client has a real
    // row to confirm/dismiss against — the same proposal→confirm→commit
    // contract ActionProposalCard already uses for chat (CLA-FR-006: "AI
    // said" vs "AI did" must stay visually and structurally distinct, never
    // auto-applied). Without this, "Confirmer & Enregistrer" on Home had
    // nothing durable to act on and only ever cleared local React state —
    // dismissing or confirming was indistinguishable and nothing was ever
    // actually committed, contradicting registry §2.7's own description of
    // each agent feeding "a confirm-to-commit flow."
    const proposals: { id: string; agent: string; action_type: string; title: string; body: string; based_on: unknown }[] = [];
    const today = todayKey();

    // Upserts on idempotency_key so remounting Home the same day reuses the
    // same row (and its real confirmed/dismissed status) instead of
    // spawning a fresh "proposed" row every time — a user who already
    // confirmed/dismissed today's sport suggestion must not see it reappear
    // just because they revisited Home.
    async function upsertProposal(agent: string, actionType: string, title: string, body: string, basedOn: unknown): Promise<{ id: string; status: string } | null> {
      const idempotencyKey = `prepared:${userId}:${agent}:${today}`;
      const { data: existing } = await client.from("action_proposals").select("id, status").eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return existing;
      const { data: inserted, error } = await client
        .from("action_proposals")
        .insert({
          user_id: userId,
          action_type: actionType,
          proposed_fields: { title, body, based_on: basedOn },
          explanation: body,
          idempotency_key: idempotencyKey,
        })
        .select("id, status")
        .single();
      if (error) {
        // 23505 = unique_violation on idempotency_key — the select above
        // raced with another near-simultaneous call for the same
        // user/agent/day (e.g. Home re-mounting quickly, or two tabs) and
        // lost; the other call's insert already committed the real row,
        // so fetch and return THAT instead of silently dropping this
        // proposal for the caller. Any other error still logs and no-ops.
        if (error.code === "23505") {
          const { data: raced } = await client.from("action_proposals").select("id, status").eq("idempotency_key", idempotencyKey).maybeSingle();
          if (raced) return raced;
        }
        console.log(JSON.stringify({ event: "prepared_agents_proposal_insert_failed", agent, error: error.message, code: error.code }));
        return null;
      }
      return inserted;
    }

    // --- meal-agent: today's already-planned meals, if any exist ---
    const { data: todaysMeals } = await client
      .from("meal_plans")
      .select("id, meal_slot, title, calories")
      .eq("user_id", userId)
      .eq("day", today)
      .order("meal_slot", { ascending: true });

    if (todaysMeals && todaysMeals.length > 0) {
      const slotLabel: Record<string, string> = { breakfast: "petit-déjeuner", lunch: "déjeuner", dinner: "dîner" };
      const list = todaysMeals.map((m) => `${slotLabel[m.meal_slot as string] ?? m.meal_slot} : ${m.title}`).join(", ");
      const title = "Repas du jour";
      const body = `Aujourd'hui : ${list}.`;
      const basedOn = todaysMeals.map((m) => m.id);
      const row = await upsertProposal("meal_agent", "acknowledge_meals", title, body, basedOn);
      if (row && row.status === "proposed") {
        proposals.push({ id: row.id, agent: "meal_agent", action_type: "acknowledge_meals", title, body, based_on: basedOn });
      }
    }

    // --- revenue-agent: only if behind monthly pace ---
    const { data: profileRow } = await client.from("profiles").select("business").eq("user_id", userId).maybeSingle();
    const business = (profileRow?.business as Record<string, unknown> | null) ?? null;
    const objectifCA = Number(business?.objectifCA);

    if (Number.isFinite(objectifCA) && objectifCA > 0) {
      // Uses the Europe/Paris calendar date, not the Deno runtime's local
      // getters (effectively UTC on this platform) — same reasoning as
      // todayKey() above: a revenue entry logged in the first 1-2 hours
      // of a new Paris day/month could otherwise land on the wrong side
      // of this month-start boundary.
      const { iso: todayParis } = parisDateParts();
      const [y, m, d] = todayParis.split("-").map(Number);
      const monthStartKey = `${y}-${String(m).padStart(2, "0")}-01`;
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const dayOfMonth = d;

      const { data: monthRevenue } = await client
        .from("finance_entries")
        .select("amount")
        .eq("user_id", userId)
        .eq("type", "revenue")
        .gte("entry_date", monthStartKey);
      const actualRevenue = (monthRevenue ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
      const expectedPace = (objectifCA / daysInMonth) * dayOfMonth;

      // Only produce a proposal when genuinely behind pace — never on a
      // quiet/on-track day (registry §2.7's guardrail).
      if (actualRevenue < expectedPace * 0.85) {
        const systemPrompt = `Tu es l'agent revenus de Claré. Réponds via l'outil fourni. Produis EXACTEMENT 3 actions concrètes et réalisables cette semaine pour rattraper le rythme — jamais de conseil vague ("travaille plus"), toujours une action précise et actionnable.`;
        const msg = `Objectif du mois : ${objectifCA}€. Réalisé à ce jour (jour ${dayOfMonth}/${daysInMonth}) : ${actualRevenue.toFixed(0)}€. Rythme attendu à ce stade : ${expectedPace.toFixed(0)}€. Secteur : ${business?.secteur || "non précisé"}.`;

        const { result, usage } = await callClaudeStructured({
          systemPrompt,
          messages: [{ role: "user", content: msg }],
          toolName: "revenue_catchup_plan",
          toolDescription: "Produit exactement 3 actions concrètes pour rattraper le rythme de revenus.",
          outputSchema: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"] },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: ["actions"],
          },
          maxTokens: MAX_TOKENS,
        });
        logTokenUsage("prepared-agents:revenue", userId, usage);
        const parsed = revenueCatchupPlanSchema.parse(result);

        const title = "Rattraper le rythme";
        const body = parsed.actions.map((a: { title: string }) => a.title).join(" · ");
        const basedOn = { objectifCA, actualRevenue, expectedPace, actions: parsed.actions };
        const row = await upsertProposal("revenue_agent", "create_tasks_batch", title, body, basedOn);
        if (row && row.status === "proposed") {
          proposals.push({ id: row.id, agent: "revenue_agent", action_type: "create_tasks_batch", title, body, based_on: basedOn });
        }
      }
    }

    // --- sport-agent: recent real workout history ---
    // .neq("workout_status", null) does NOT work as "IS NOT NULL" — SQL
    // null comparisons never evaluate true via =/<>, so that filter would
    // silently return zero rows regardless of real data. .not(..., "is",
    // null) is PostgREST's correct IS NOT NULL form.
    const { data: recentWorkouts } = await client
      .from("journal_entries")
      .select("entry_date, workout_status, workout_detail")
      .eq("user_id", userId)
      .not("workout_status", "is", null)
      .order("entry_date", { ascending: false })
      .limit(5);

    const realWorkouts = (recentWorkouts ?? []).filter((w) => w.workout_status && w.workout_status !== "none");
    if (realWorkouts.length > 0) {
      const systemPrompt = `Tu es l'agent sport de Claré. Réponds via l'outil fourni. Propose la prochaine séance en te basant UNIQUEMENT sur l'historique réel fourni — jamais un programme générique déconnecté de ce que la personne fait vraiment.`;
      const historyText = realWorkouts.map((w) => `${w.entry_date} : ${w.workout_status}${w.workout_detail ? ` (${w.workout_detail})` : ""}`).join("; ");
      const msg = `Historique récent des séances : ${historyText}`;

      const { result, usage } = await callClaudeStructured({
        systemPrompt,
        messages: [{ role: "user", content: msg }],
        toolName: "sport_session_plan",
        toolDescription: "Propose la prochaine séance de sport basée sur l'historique réel.",
        outputSchema: {
          type: "object",
          properties: { session_plan: { type: "string" } },
          required: ["session_plan"],
        },
        maxTokens: MAX_TOKENS,
      });
      logTokenUsage("prepared-agents:sport", userId, usage);
      const parsed = sportSessionPlanSchema.parse(result);

      const title = "Prochaine séance";
      const body = parsed.session_plan;
      const basedOn = recentWorkouts?.slice(0, 3).map((w) => w.entry_date);
      const row = await upsertProposal("sport_agent", "create_task", title, body, basedOn);
      if (row && row.status === "proposed") {
        proposals.push({ id: row.id, agent: "sport_agent", action_type: "create_task", title, body, based_on: basedOn });
      }
    }

    return new Response(JSON.stringify({ proposals }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
