import { supabase } from "@/lib/supabase";

/**
 * dismissProposals — "Undo" within ClerkExtractBanners' short window:
 * dismisses the underlying action_proposals rows back to a non-confirmed
 * state. The domain rows already written stay written (this app has no
 * soft-delete/undo for tasks/calendar_items/etc. yet), but marking the
 * proposal dismissed at least stops it from being double-counted or
 * re-surfaced elsewhere. A true undo (deleting the committed domain row)
 * is a bigger, riskier feature intentionally not built as a side effect
 * of a toast banner's "Annuler" link.
 */
export async function dismissProposals(proposalIds: string[]): Promise<void> {
  if (proposalIds.length === 0) return;
  await supabase.from("action_proposals").update({ status: "dismissed" }).in("id", proposalIds);
}
