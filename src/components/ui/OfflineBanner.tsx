import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OfflineBanner — Step 1.2.5 primitive, per docs/04_ApplicationFlow.md §3
 * "Offline" row: a slim, non-blocking app-wide banner, mounted once at the
 * app root (Step 1.3's root layout will render this), never a modal.
 *
 * Distinct from "slow network" — this only appears when useOnlineStatus is
 * genuinely false (no network interface), not just a slow connection.
 *
 * Gap fix (found during Step 1.2.5 bug-hunt): the live region (role=status)
 * used to only exist in the DOM once offline, mounted via AnimatePresence's
 * conditional child. Some screen readers don't reliably announce a live
 * region that appears for the first time with content already inside it —
 * the region needs to already be present, with content changing inside it,
 * for consistent announcement. Restructured so the aria-live container is
 * always rendered (empty when online); only the animated visual wrapper is
 * conditional.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <div role="status" aria-live="polite">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-navy px-4 py-2 text-body-sm font-semibold text-white"
          >
            <WifiOff size={16} strokeWidth={2} />
            Hors ligne — reconnexion en cours...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
