import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { BottomTabNav } from "@/components/ui/BottomTabNav";
import { SideNavRail } from "@/components/ui/SideNavRail";
import { NAV_ITEMS } from "@/components/ui/navItems";
import { ClerkExtractBanners } from "@/features/chat/ClerkExtractBanners";
import { useClerkExtractBannerBus } from "@/lib/clerkExtractBannerBus";
import { dismissProposals } from "@/lib/clerkExtractRepo";
import { supabase } from "@/lib/supabase";

/**
 * AppShell — wraps every main authenticated screen with the persistent
 * navigation chrome (§6.4): BottomTabNav on mobile/tablet, SideNavRail on
 * desktop (1024px+). Both components existed since Step 1.2 but were never
 * actually rendered anywhere outside the dev component preview — found
 * during a Step 8 browser audit that every screen except Home (reachable
 * only via its own in-content cards) had genuinely no way to navigate away
 * except the browser's native Back button. This is the fix, applied once
 * here rather than per-screen.
 *
 * activeKey falls back to "" (no highlighted tab) for routes reachable from
 * a NAV_ITEMS screen but not one themselves (e.g. /focus, /nutrition,
 * /lieux) — the nav stays visible and usable, it just doesn't claim to be
 * "on" a tab it isn't.
 *
 * No extra bottom padding is added here — most screens already carry their
 * own pb-28/pb-24 anticipating a fixed bottom bar (dating back to their
 * original extraction), confirming the nav was always meant to be wired in.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.href));
  const activeKey = activeItem?.key ?? "";
  const { confirmedProposals } = useClerkExtractBannerBus();

  const onNavigate = (href: string) => navigate(href);

  // Signs the user out and returns to /sign-in — same supabase.auth.signOut()
  // call already used after account deletion (SettingsRoute.tsx), just
  // reachable directly now rather than only as a side effect of deleting
  // the account. Matches that same navigate("/sign-in") destination.
  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate("/sign-in");
  };

  return (
    <div className="lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Mounted here (not inside ChatScreen) so a proposal confirmed on any
          screen shows its banner regardless of which screen is active when
          confirmation completes — 04_ApplicationFlow.md §2.7's cross-cutting
          requirement; previously only worked while the user stayed on Chat. */}
      <ClerkExtractBanners confirmedProposals={confirmedProposals} onUndo={(ids) => dismissProposals(ids).catch(() => {})} />
      <SideNavRail activeKey={activeKey} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="min-h-dvh lg:min-h-0 lg:h-dvh lg:overflow-y-auto flex-1 lg:pl-64 bg-bg">
        {/* Subtle content-area fade/slide on route change (UI Polish Step 5,
            docs/09_UIPolishMasterPrompts.md) — duration/easing match the
            established convention from OnboardingIntroScreen.tsx. Keyed on
            pathname so it re-triggers on every navigation, not just mount.
            reducedMotion is handled automatically via the app-wide
            MotionConfig in main.jsx — no extra wiring needed here. The nav
            rail/tab bar deliberately live outside this AnimatePresence so
            their active-state indicator stays instantly responsive. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomTabNav activeKey={activeKey} onNavigate={onNavigate} />
    </div>
  );
}
