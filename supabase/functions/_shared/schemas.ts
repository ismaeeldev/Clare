// @deno-types="npm:@types/node"
import { z } from "npm:zod@4";

/**
 * Shared Zod output schemas for the Edge Functions in this project — per
 * docs/06_AIPromptRegistry.md §1 rule 2 ("structured output... never parse
 * free text with fence-stripping or brace-slicing" — the exact defect
 * src/lib/askClare.ts's callers all had, and which every Edge Function in
 * this directory replaces).
 */

export const actionProposalSchema = z.object({
  action_type: z.enum(["create_task", "create_calendar_item", "create_finance_entry", "replan_week", "create_idea", "update_journal_state"]),
  proposed_fields: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).optional(),
  explanation: z.string(),
});
export type ActionProposal = z.infer<typeof actionProposalSchema>;

// docs/06_AIPromptRegistry.md §2.1 chat-respond
// detected_action_proposals is an ARRAY (previously a single optional
// object) — a user report confirmed a single message containing a
// revenue entry + an expense + an appointment + an idea only ever
// produced ONE proposal card (whichever the model emitted last), and for
// the idea specifically — not a valid action_type in the old enum at
// all — the model had no structured way to express it and just claimed
// in reply_text that it had been noted, with nothing actually written
// anywhere. create_idea/update_journal_state were already fully
// supported client-side (ActionProposalCard.tsx, used by clerk-extract's
// brain-dump flow) but never reachable from normal chat.
export const chatRespondOutputSchema = z.object({
  reply_text: z.string(),
  detected_action_proposals: z.array(actionProposalSchema).optional(),
  quick_replies: z.array(z.string()).optional(),
});
export type ChatRespondOutput = z.infer<typeof chatRespondOutputSchema>;

// docs/06_AIPromptRegistry.md §2.2 chat-welcome
export const chatWelcomeOutputSchema = z.object({
  welcome_text: z.string(),
});
export type ChatWelcomeOutput = z.infer<typeof chatWelcomeOutputSchema>;

// docs/06_AIPromptRegistry.md §2.4 clerk-extract
export const clerkExtractOutputSchema = z.object({
  ideas: z.array(z.object({ text: z.string(), category: z.enum(["perso", "pro"]) })),
  appointments: z.array(z.object({ title: z.string(), computed_date: z.string(), computed_time: z.string().optional() })),
  finance: z.array(z.object({ amount: z.number(), type: z.enum(["revenue", "expense"]), category: z.string().optional() })),
  state_signals: z.array(z.object({ energy_delta: z.number().optional(), note: z.string() })),
});
export type ClerkExtractOutput = z.infer<typeof clerkExtractOutputSchema>;

// docs/06_AIPromptRegistry.md §2.3 disruption-replan
const diffItemSchema = z.object({ jour: z.string().optional(), champ: z.string().optional(), valeur: z.unknown().optional() }).catchall(z.unknown());
export const disruptionDiffSchema = z.object({
  diff: z.object({
    moved: z.array(diffItemSchema),
    added: z.array(diffItemSchema),
    dropped: z.array(diffItemSchema),
    unchanged_count: z.number(),
  }),
  explanation: z.string(),
});
export type DisruptionDiffOutput = z.infer<typeof disruptionDiffSchema>;

// docs/06_AIPromptRegistry.md §2.6 meal-plan-generate
const mealSuggestionSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.object({ name: z.string(), grams: z.number() })),
});
export const mealPlanGenerateOutputSchema = z.object({
  days: z.array(
    z.object({
      day_offset: z.number(),
      breakfast: mealSuggestionSchema,
      lunch: mealSuggestionSchema,
      dinner: mealSuggestionSchema,
    })
  ),
});
export type MealPlanGenerateOutput = z.infer<typeof mealPlanGenerateOutputSchema>;

// prepared-agents: revenue_agent + sport_agent outputs
export const revenueCatchupPlanSchema = z.object({
  actions: z.array(z.object({ title: z.string(), description: z.string() })).min(3).max(3),
});
export type RevenueCatchupPlan = z.infer<typeof revenueCatchupPlanSchema>;

export const sportSessionPlanSchema = z.object({ session_plan: z.string() });
export type SportSessionPlan = z.infer<typeof sportSessionPlanSchema>;

// docs/06_AIPromptRegistry.md §2.5 + §2.6 prep-dimanche-brief
export const prepDimancheSummarySchema = z.object({
  resume: z.string(),
  priorites: z.array(z.string()).optional(),
  miroir_projets: z.string().optional(),
  ne_pas_faire: z.array(z.string()).optional(),
  finances: z.string().optional(),
  motivation: z.string().optional(),
  courses: z.array(z.string()).optional(),
});
export type PrepDimancheSummary = z.infer<typeof prepDimancheSummarySchema>;

export const prepDimanchePlanSchema = z.object({
  jours: z.array(
    z.object({
      jour: z.string(),
      date: z.string(),
      alerte: z.string().nullable().optional(),
      conseil: z.string().optional(),
      tache_1: z.string().optional(),
      taches_3: z.array(z.string()).optional(),
      taches_5: z.array(z.string()).optional(),
      repasMidi: z.string().optional(),
      repasSoir: z.string().optional(),
    })
  ),
});
export type PrepDimanchePlan = z.infer<typeof prepDimanchePlanSchema>;

// nutrition-recette
export const nutritionRecetteOutputSchema = z.object({
  nom: z.string(),
  temps: z.string().optional(),
  calories: z.string().optional(),
  ingredients: z.array(z.string()),
  etapes: z.array(z.string()),
});
export type NutritionRecetteOutput = z.infer<typeof nutritionRecetteOutputSchema>;

// stats-bilan
export const statsBilanOutputSchema = z.object({
  note: z.string().optional(),
  resume: z.string(),
  points_forts: z.array(z.string()).optional(),
  points_attention: z.array(z.string()).optional(),
  priorites_semaine_prochaine: z.array(z.string()).optional(),
  motivation: z.string().optional(),
});
export type StatsBilanOutput = z.infer<typeof statsBilanOutputSchema>;
