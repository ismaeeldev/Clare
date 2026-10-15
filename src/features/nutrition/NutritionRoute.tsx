import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import { loadProfile } from "@/lib/profileRepo";
import { NutritionScreen } from "./NutritionScreen";

/**
 * NutritionRoute — router-level wrapper for NutritionScreen. Step 5.3
 * replaced the placeholder profile/agenda data this route used to pass
 * with a real profile fetch (for the header subtitle, calorie-target
 * banner, and budget badge) — meal-plan-generate/nutrition-calc fetch
 * their own server-side data, so this route only needs profile for
 * display, same pattern as ProfilEditRoute.
 */
export function NutritionRoute() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BuildSystemPromptProfile | undefined>(undefined);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const saved = await loadProfile(user.id);
        if (saved) setProfile({ ...saved.form, equipements: saved.equipements.join(", ") });
      } catch {
        // Profile stays undefined — the screen already handles a missing
        // profile gracefully (falls back to "Standard"/defaults).
      }
    })();
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  // No loadingProfile gate here (deliberate, found during a Step 1-8
  // UI-polish pass): NutritionScreen already renders correctly with
  // profile undefined (falls back to "Standard" text, per its own null
  // checks throughout), and mounts its own real header + shaped
  // loadingPlan skeleton immediately either way. Gating the whole screen
  // on the profile fetch only delayed that real skeleton behind an extra,
  // unnecessary plain centered dot.
  return <NutritionScreen userId={user.id} profile={profile} journal={[]} />;
}
