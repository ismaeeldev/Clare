import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ActionType } from "./ActionProposalCard";

/**
 * ClerkExtractBanners — Step 4.4 task 4, per docs/04_ApplicationFlow.md
 * §2.7 exactly: "💡 3 idées classées" / "📅 Rendez-vous ajouté" /
 * "📓 Journal mis à jour" toast banners, tap to view/undo within a short
 * window, auto-dismiss after ~5s. Fires as each clerk-extract proposal is
 * confirmed (via ChatScreen's "Tout accepter" or individual taps) — reflects
 * only what was ACTUALLY confirmed and written, never a guess at what the
 * extraction found. Mounted once in AppShell (not inside ChatScreen), fed by
 * the app-wide clerkExtractBannerBus, so it stays visible even if the user
 * navigates away from Chat right after confirming.
 */
export interface ClerkExtractProposal {
  id: string;
  action_type: ActionType;
  proposed_fields: Record<string, unknown>;
  explanation: string;
}

interface Banner {
  key: string;
  icon: string;
  text: string;
  proposalIds: string[];
}

const BANNER_ORDER: { actionTypes: ActionType[]; icon: string; label: (count: number) => string }[] = [
  { actionTypes: ["create_idea"], icon: "💡", label: (n) => `${n} idée${n > 1 ? "s" : ""} classée${n > 1 ? "s" : ""}` },
  { actionTypes: ["create_calendar_item"], icon: "📅", label: () => "Rendez-vous ajouté" },
  { actionTypes: ["create_finance_entry", "update_journal_state"], icon: "📓", label: () => "Journal mis à jour" },
];

/**
 * Builds one banner per matching action-type group, each keyed uniquely
 * (batchKey prefix) so two separate confirmation batches of the same
 * category (e.g. two ideas confirmed minutes apart) never collide or get
 * merged into a stale banner's count — each batch is its own independent,
 * independently-timed banner.
 */
function buildBanners(confirmed: ClerkExtractProposal[], batchKey: string): Banner[] {
  const banners: Banner[] = [];
  for (const group of BANNER_ORDER) {
    const matching = confirmed.filter((p) => group.actionTypes.includes(p.action_type));
    if (matching.length === 0) continue;
    banners.push({
      key: `${batchKey}-${group.actionTypes.join("+")}`,
      icon: group.icon,
      text: group.label(matching.length),
      proposalIds: matching.map((p) => p.id),
    });
  }
  return banners;
}

export function ClerkExtractBanners({ confirmedProposals, onUndo }: { confirmedProposals: ClerkExtractProposal[]; onUndo?: (proposalIds: string[]) => void }) {
  const [visible, setVisible] = useState<Banner[]>([]);
  const seenCountRef = useRef(0);

  useEffect(() => {
    // Only react to genuinely NEW confirmations (array grew) — the parent
    // may re-render for unrelated reasons while `confirmedProposals`
    // itself is unchanged, and this must not re-fire on every render.
    if (confirmedProposals.length <= seenCountRef.current) return;
    const newlyConfirmed = confirmedProposals.slice(seenCountRef.current);
    seenCountRef.current = confirmedProposals.length;

    const banners = buildBanners(newlyConfirmed, crypto.randomUUID());
    if (banners.length === 0) return;
    setVisible((v) => [...v, ...banners]);
    const timers = banners.map((b) => setTimeout(() => setVisible((v) => v.filter((x) => x.key !== b.key)), 5000));
    return () => timers.forEach(clearTimeout);
  }, [confirmedProposals]);

  const handleUndo = async (banner: Banner) => {
    // "Undo" within the short window: dismiss the underlying
    // action_proposals rows back to a non-confirmed state — the domain
    // rows already written stay written (this app has no soft-delete/undo
    // for tasks/calendar_items/etc. yet), but marking the proposal
    // dismissed at least stops it from being double-counted/re-surfaced.
    // A true undo (deleting the committed domain row) is a bigger, riskier
    // feature intentionally not built as a side effect of this banner.
    setVisible((v) => v.filter((x) => x.key !== banner.key));
    onUndo?.(banner.proposalIds);
  };

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(52px+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {visible.map((banner) => (
          <motion.div
            key={banner.key}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-body-sm font-semibold text-white shadow-floating"
          >
            <span>{banner.icon}</span>
            <span>{banner.text}</span>
            <button type="button" onClick={() => handleUndo(banner)} className="ml-1 text-label font-bold text-gold underline transition-opacity duration-200 hover:opacity-70">
              Annuler
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
