// journal-feedback — the missing backend half of "Claré's Insight"
// (04_ApplicationFlow.md §2.6's save-first pattern: "AI feedback/analysis
// runs asynchronously in the background... when ready, a subtle 'Claré's
// Insight' note appears"). journalRepo.ts's saveEntry always wrote
// ai_feedback_status='pending' but nothing ever transitioned it to
// 'ready'/'failed' — every entry stayed "En cours d'analyse..." forever.
// This function is called fire-and-forget by JournalScreen right after a
// successful save (never blocking the save itself — the entry is already
// safely persisted by the time this runs, matching CLA-FR-011).
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeText, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 400;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let client: ReturnType<typeof getUserClient> = null;
  let userId: string | null = null;
  let entryDate = "";

  try {
    userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    client = getUserClient(req)!;

    const body = await req.json().catch(() => ({}));
    entryDate = typeof body.entry_date === "string" ? body.entry_date : "";
    if (!entryDate.trim()) {
      return new Response(JSON.stringify({ error: "entry_date is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Feedback is a value-add on top of an already-saved entry, not a
    // paywall gate on the save itself — a non-entitled user's entry still
    // gets 'pending' with no crash; the UI's "En cours d'analyse..." simply
    // never resolves for them, which is an acceptable degradation (never
    // silently marking it 'failed' just because of entitlement, since that
    // reads as "something broke" rather than "not included in your plan").
    const { entitled } = await checkEntitlement(client, userId);
    if (!entitled) {
      return new Response(JSON.stringify({ skipped: "not_entitled" }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Same daily-cap guard every other Claude-calling function in this
    // project applies — this call is fire-and-forget from the client on
    // every journal save, so it's a real cost/abuse vector without it.
    const { allowed } = await checkDailyMessageLimit(client, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ skipped: "rate_limited" }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const { data: entry, error: entryError } = await client
      .from("journal_entries")
      .select("entry_date, energy, mood, workout_status, workout_detail, revenue, expenses, text_content, project_touched")
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .single();
    if (entryError) throw entryError;

    const ctx = await buildFullContext(client, userId);
    const systemPrompt =
      buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux) +
      `

Réponds en 2-4 phrases max, ton direct et bienveillant — un retour court sur la journée qu'on vient de te raconter, jamais un résumé générique.`;

    const msg = `Voici ce que j'ai raconté pour ma journée du ${entryDate} : "${entry.text_content || "(rien de particulier noté)"}"
Énergie : ${entry.energy ?? "-"}/5, Humeur : ${entry.mood ?? "-"}/5.
Sport : ${entry.workout_status ?? "non"}${entry.workout_detail ? ` (${entry.workout_detail})` : ""}.
Revenus du jour : ${entry.revenue ?? 0}€, Dépenses : ${entry.expenses ?? 0}€.
Projet travaillé : ${entry.project_touched || "aucun"}.
Fais-moi un retour bref sur cette journée.`;

    const { result: feedback, usage } = await callClaudeText({ systemPrompt, messages: [{ role: "user", content: msg }], maxTokens: MAX_TOKENS });
    logTokenUsage("journal-feedback", userId, usage);

    if (!feedback.trim()) throw new Error("Claude n'a retourné aucun retour");

    const { error: updateError } = await client
      .from("journal_entries")
      .update({ ai_feedback: feedback, ai_feedback_status: "ready" })
      .eq("user_id", userId)
      .eq("entry_date", entryDate);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ai_feedback: feedback }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    // Never leave the row stuck at 'pending' forever — mark it 'failed' so
    // the already-built failed-state UI (JournalScreen.tsx) actually has a
    // real code path that produces it, instead of being permanently dead.
    if (client && userId && entryDate) {
      await client.from("journal_entries").update({ ai_feedback_status: "failed" }).eq("user_id", userId).eq("entry_date", entryDate).then(
        () => {},
        () => {}
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
