import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { loadProfile } from "@/lib/profileRepo";
import { OnboardingIntroScreen } from "./OnboardingIntroScreen";
import { ProfilSetupScreen } from "./ProfilSetupScreen";
import type { ProfilForm } from "./types";

/**
 * OnboardingScreen — composes the intro (App.jsx lines 460-563) and setup
 * (lines 601-804) phases, matching the original's phase-switch pattern
 * (intro -> setup -> done). On completion, redirects to /home per
 * docs/04_ApplicationFlow.md §2.2 ("Final step exit -> brief transition ->
 * Home"). The brief "Claré is getting ready..." transition itself needs
 * real Home data to be meaningful (Step 4+ agents) — deferred; Home's own
 * loading skeleton (Step 1.3) covers the gap until then.
 *
 * Resume behavior (Step 3.2): if the user already has ANY saved onboarding
 * progress (a profiles row exists, even at step 0), skip the intro screens
 * entirely and go straight to ProfilSetupScreen, which resumes at the
 * saved step — the 3 intro screens are a first-time-only welcome, not
 * something a returning-mid-onboarding user should see again on refresh.
 */
export function OnboardingScreen() {
  const { user, loading: authLoading } = useAuth();
  const [phase, setPhase] = useState<"checking" | "intro" | "setup">("checking");
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const saved = await loadProfile(user.id);
        setPhase(saved ? "setup" : "intro");
      } catch {
        // Can't tell if progress exists (offline, etc.) — default to intro
        // rather than blocking the whole screen; worst case a returning
        // user sees the welcome screens again, which is harmless.
        setPhase("intro");
      }
    })();
  }, [user, authLoading]);

  const handleDone = (_profile: ProfilForm & { equipements: string }) => {
    navigate("/home");
  };

  if (phase === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  if (phase === "setup") {
    return <ProfilSetupScreen onDone={handleDone} />;
  }

  return <OnboardingIntroScreen onDone={() => setPhase("setup")} />;
}
