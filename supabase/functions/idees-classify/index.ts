// idees-classify — server-side replacement for IdeesScreen's classification
// call. Not a dedicated docs/06_AIPromptRegistry.md entry — built as part
// of Step 4.2's expanded scope to fully retire api/claude.js. Structured
// output (real JSON schema, not brace-slicing) per registry §1 rule 2.
import { z } from "npm:zod@4";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserClient, getUserId } from "../_shared/auth.ts";
import { buildFullContext } from "../_shared/fullContext.ts";
import { buildSystemPrompt } from "../_shared/buildSystemPrompt.ts";
import { callClaudeStructured, logTokenUsage } from "../_shared/claude.ts";
import { checkDailyMessageLimit } from "../_shared/rateLimit.ts";
import { checkEntitlement } from "../_shared/entitlement.ts";

const MAX_TOKENS = 300;

const outputSchema = z.object({
  categorie: z.enum(["perso", "pro"]),
  projet: z.string().nullable(),
  titre_court: z.string(),
});

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
    const texte: string = typeof body.texte === "string" ? body.texte : "";
    if (!texte.trim()) {
      return new Response(JSON.stringify({ error: "texte is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const ctx = await buildFullContext(client, userId);
    const systemPrompt =
      buildSystemPrompt(ctx.profile, ctx.journal, ctx.agenda, ctx.finances, ctx.lieux) +
      `

Si l'idée mentionne un projet connu (Kaërt Groupe, CourtierTravaux, Webenvue, Le Chemin Intérieur, Bloc d'Espoir, ou tout autre projet que l'utilisateur a mentionné), identifie-le dans "projet". Sinon mets null.`;

    try {
      const { result, usage } = await callClaudeStructured({
        systemPrompt,
        messages: [{ role: "user", content: `Classe cette idée : "${texte}"` }],
        toolName: "classify_idea",
        toolDescription: "Classe l'idée en perso/pro, identifie le projet lié si connu, et résume-la en 4-6 mots.",
        outputSchema: {
          type: "object",
          properties: {
            categorie: { type: "string", enum: ["perso", "pro"] },
            projet: { type: ["string", "null"] },
            titre_court: { type: "string" },
          },
          required: ["categorie", "projet", "titre_court"],
        },
        maxTokens: MAX_TOKENS,
      });
      logTokenUsage("idees-classify", userId, usage);
      const parsed = outputSchema.parse(result);
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "content-type": "application/json" } });
    } catch {
      // Same fallback the original client-side classifierIdee used on any
      // failure — never blocks the user from capturing the idea itself.
      const fallback = { categorie: "perso" as const, projet: null, titre_court: texte.slice(0, 40) };
      return new Response(JSON.stringify(fallback), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
