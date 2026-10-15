// agenda-conflict — 04_ApplicationFlow.md §2.5's "AI conflict commentary":
// "if two items overlap, a small inline warning chip appears on both, tap
// for Claré's suggestion text (read-only commentary, not auto-resolved)".
// This was a literal TODO stub with zero implementation (found during a
// flow-doc audit) — overlap DETECTION itself is deterministic and lives
// client-side (src/lib/agendaConflicts.ts), matching this app's rule that
// AI never invents facts a plain comparison can establish. This function's
// only job is the natural-language suggestion text for an already-detected
// overlap — read-only, never writes to calendar_items itself.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { callClaudeText, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 200;

const SYSTEM_PROMPT = `Tu es Claré, assistant de vie personnel français. L'utilisateur a deux rendez-vous qui se chevauchent dans son agenda. Donne un commentaire court (2 phrases max) et concret sur ce chevauchement — jamais un conseil générique. Tu ne peux PAS modifier son agenda toi-même, seulement suggérer (ex: décaler lequel, ou si l'un peut être raccourci). Réponds en français, ton direct.`;

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

    const MAX_FIELD_LEN = 200;
    const body = await req.json().catch(() => ({}));
    const itemA = typeof body.item_a === "string" ? body.item_a.slice(0, MAX_FIELD_LEN) : "";
    const itemB = typeof body.item_b === "string" ? body.item_b.slice(0, MAX_FIELD_LEN) : "";
    const timeA = typeof body.time_a === "string" ? body.time_a.slice(0, MAX_FIELD_LEN) : "";
    const timeB = typeof body.time_b === "string" ? body.time_b.slice(0, MAX_FIELD_LEN) : "";
    if (!itemA.trim() || !itemB.trim()) {
      return new Response(JSON.stringify({ error: "item_a and item_b are required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const msg = `Chevauchement détecté : "${itemA}" (${timeA}) et "${itemB}" (${timeB}) se recouvrent dans le temps. Que me suggères-tu ?`;

    const { result: text, usage } = await callClaudeText({ systemPrompt: SYSTEM_PROMPT, messages: [{ role: "user", content: msg }], maxTokens: MAX_TOKENS });
    logTokenUsage("agenda-conflict", userId, usage);

    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
