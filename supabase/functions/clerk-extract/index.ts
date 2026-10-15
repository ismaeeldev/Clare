// clerk-extract — docs/06_AIPromptRegistry.md §2.4.
// Trigger: after a brain-dump session ends (client calls this once the
// user signals "done" — see ChatScreen's brain-dump mode).
// Input: the brain-dump text since the session started.
// Output: { ideas, appointments, finance, state_signals } — see schema.ts.
// Guardrail (hard rule): only explicit facts, never invented. If a date/
// amount/fact isn't clearly stated or computable from an explicit relative
// reference ("demain", "vendredi prochain"), omit it rather than guess.
// Every extracted item becomes its OWN action_proposals row — this
// function never writes to ideas/tasks/calendar_items/finance_entries/
// journal_entries directly; that only happens on the client's explicit
// per-item or "Accept all" confirm (Step 4.4 task 3).
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { clerkExtractOutputSchema } from "../_shared/schemas.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 1500;
const PROMPT_VERSION = "clerk-extract-v1";

const SYSTEM_PROMPT = `Tu es un agent d'extraction pour Claré, assistant de vie personnel français.

Ta tâche : lire un texte de "vide-tête" (brain-dump) où l'utilisateur balance en vrac tout ce qui lui passe par la tête, et en extraire UNIQUEMENT les faits explicitement énoncés.

RÈGLE ABSOLUE — NE JAMAIS INVENTER :
- N'extrais un rendez-vous QUE si une date est explicitement donnée ou calculable sans ambiguïté à partir d'une référence relative claire ("demain", "vendredi prochain", "dans 2 jours"). Si la date est vague ("bientôt", "un de ces jours", "il faut que je...") — n'extrais PAS de rendez-vous du tout, ignore ce fait plutôt que de deviner une date.
- N'extrais un montant financier QUE si un chiffre précis est donné ("800€", "environ 50 balles" compte, "pas mal d'argent" ne compte pas).
- N'extrais un signal d'état (énergie/humeur) QUE si l'utilisateur exprime clairement un état ("épuisée" = énergie basse, "au top" = énergie haute) — jamais déduit d'un ton général.
- Si tu n'es pas sûr qu'un fait soit assez explicite, OMETS-le plutôt que de risquer d'inventer.

Réponds via l'outil fourni avec exactement les faits explicites trouvés — un texte sans aucun fait extractible peut renvoyer des listes vides, c'est normal et correct.`;

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

    const body = await req.json().catch(() => ({}));
    const conversationId: string | undefined = body.conversation_id;
    const brainDumpText: string = typeof body.text === "string" ? body.text : "";
    if (!brainDumpText.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    // Give the model the day-of-week name directly instead of making it
    // compute weekday-from-date itself — that arithmetic is exactly the
    // kind of thing LLMs get wrong (observed in testing: "vendredi" from a
    // Wednesday resolved to the wrong Friday, off by one day).
    const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const todayWeekday = WEEKDAYS_FR[now.getUTCDay()];
    const NEXT_7_DAYS_FR = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + i + 1);
      return `${WEEKDAYS_FR[d.getUTCDay()]}=${d.toISOString().split("T")[0]}`;
    }).join(", ");
    const { result, usage } = await callClaudeStructured({
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Date d'aujourd'hui : ${today} (${todayWeekday}). Table des 7 prochains jours pour résoudre les références relatives ("demain", "vendredi", "vendredi prochain") — utilise EXACTEMENT ces dates, ne recalcule rien toi-même : ${NEXT_7_DAYS_FR}.\n\nTexte du vide-tête :\n${brainDumpText}`,
        },
      ],
      toolName: "extract_facts",
      toolDescription: "Extrait les idées, rendez-vous, faits financiers et signaux d'état explicites du texte.",
      outputSchema: {
        type: "object",
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, category: { type: "string", enum: ["perso", "pro"] } },
              required: ["text", "category"],
            },
          },
          appointments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                computed_date: { type: "string" },
                computed_time: { type: "string" },
              },
              required: ["title", "computed_date"],
            },
          },
          finance: {
            type: "array",
            items: {
              type: "object",
              properties: {
                amount: { type: "number" },
                type: { type: "string", enum: ["revenue", "expense"] },
                category: { type: "string" },
              },
              required: ["amount", "type"],
            },
          },
          state_signals: {
            type: "array",
            items: {
              type: "object",
              properties: { energy_delta: { type: "number" }, note: { type: "string" } },
              required: ["note"],
            },
          },
        },
        required: ["ideas", "appointments", "finance", "state_signals"],
      },
      maxTokens: MAX_TOKENS,
    });
    logTokenUsage("clerk-extract", userId, usage);

    const parsed = clerkExtractOutputSchema.parse(result);

    // Every extracted item becomes its own action_proposals row — never a
    // direct write to any domain table (task 3's hard requirement).
    const rows: {
      user_id: string;
      conversation_id: string | null;
      action_type: string;
      proposed_fields: Record<string, unknown>;
      explanation: string;
      status: "proposed";
      prompt_version: string;
      model_id: string;
      idempotency_key: string;
    }[] = [];

    for (const idea of parsed.ideas) {
      rows.push({
        user_id: userId,
        conversation_id: conversationId ?? null,
        action_type: "create_idea",
        proposed_fields: { text: idea.text, category: idea.category, source: "brain_dump" },
        explanation: `Idée notée dans le vide-tête : "${idea.text}"`,
        status: "proposed",
        prompt_version: PROMPT_VERSION,
        model_id: "claude-sonnet-4-5",
        idempotency_key: crypto.randomUUID(),
      });
    }
    for (const appt of parsed.appointments) {
      rows.push({
        user_id: userId,
        conversation_id: conversationId ?? null,
        action_type: "create_calendar_item",
        proposed_fields: { title: appt.title, date: appt.computed_date, time: appt.computed_time ?? null },
        explanation: `Rendez-vous détecté dans le vide-tête : "${appt.title}" le ${appt.computed_date}`,
        status: "proposed",
        prompt_version: PROMPT_VERSION,
        model_id: "claude-sonnet-4-5",
        idempotency_key: crypto.randomUUID(),
      });
    }
    for (const fin of parsed.finance) {
      rows.push({
        user_id: userId,
        conversation_id: conversationId ?? null,
        action_type: "create_finance_entry",
        proposed_fields: { amount: fin.amount, type: fin.type, category: fin.category ?? null, date: "today" },
        explanation: `${fin.type === "revenue" ? "Revenu" : "Dépense"} détecté${fin.type === "revenue" ? "" : "e"} dans le vide-tête : ${fin.amount}€`,
        status: "proposed",
        prompt_version: PROMPT_VERSION,
        model_id: "claude-sonnet-4-5",
        idempotency_key: crypto.randomUUID(),
      });
    }
    for (const signal of parsed.state_signals) {
      rows.push({
        user_id: userId,
        conversation_id: conversationId ?? null,
        action_type: "update_journal_state",
        proposed_fields: { note: signal.note, energy_delta: signal.energy_delta ?? null, date: "today" },
        explanation: `État détecté dans le vide-tête : "${signal.note}"`,
        status: "proposed",
        prompt_version: PROMPT_VERSION,
        model_id: "claude-sonnet-4-5",
        idempotency_key: crypto.randomUUID(),
      });
    }

    let insertedRows: { id: string; action_type: string; proposed_fields: Record<string, unknown>; explanation: string }[] = [];
    if (rows.length > 0) {
      const { data, error } = await client.from("action_proposals").insert(rows).select("id, action_type, proposed_fields, explanation");
      if (error) throw error;
      insertedRows = data ?? [];
    }

    return new Response(JSON.stringify({ proposals: insertedRows }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
