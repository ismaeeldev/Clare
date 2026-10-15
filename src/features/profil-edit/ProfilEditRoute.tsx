import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { BuildSystemPromptProfile } from "@/lib/buildSystemPrompt";
import { loadProfile, saveFullProfile } from "@/lib/profileRepo";
import { DEFAULT_PROFIL_FORM, type ProfilForm } from "@/features/onboarding/types";
import { ProfilEditScreen } from "./ProfilEditScreen";

/**
 * ProfilEditRoute — router-level wrapper for ProfilEditScreen (Step 3.2
 * task 6: "Settings > Edit Profile screen reusing the same field
 * components... with the same inline-save/error handling"). Loads the real
 * profile on mount (shows a skeleton while fetching, matching the same
 * pattern used for onboarding resume) and saves via profileRepo's
 * saveFullProfile — same underlying `profiles` row onboarding writes to,
 * just all 4 jsonb groups at once instead of step-by-step.
 */
export function ProfilEditRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Partial<ProfilForm> & { equipements?: string }>(DEFAULT_PROFIL_FORM);
  const [loadingProfile, setLoadingProfile] = useState(true);
  // ProfilEditForm has no UI field for objectifSport (only onboarding's
  // step 2 chips collect it) — kept out-of-band and merged back in on save
  // so Edit Profile can never silently wipe it (real bug found and fixed
  // during Step 3's post-completion bug hunt: saveFullProfile previously
  // always wrote objectif: undefined here, overwriting whatever the user
  // set during onboarding every time they saved an unrelated field).
  const [objectifSport, setObjectifSport] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const saved = await loadProfile(user.id);
        if (saved) {
          setProfile({ ...saved.form, equipements: saved.equipements.join(", ") });
          setObjectifSport(saved.form.objectifSport);
        }
      } catch {
        // Load failure just means the form opens with defaults instead of
        // prefilled values — not a blocking error, the user can still edit
        // and save (which will overwrite with whatever they enter).
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [user, authLoading]);

  const handleSave = async (fullProfile: BuildSystemPromptProfile & { equipements: string }) => {
    if (!user) return;
    const equipements = fullProfile.equipements ? fullProfile.equipements.split(", ").filter(Boolean) : [];
    const form: ProfilForm = {
      ...DEFAULT_PROFIL_FORM,
      ...fullProfile,
      prenom: fullProfile.prenom ?? "",
      budget: String(fullProfile.budget ?? ""),
      personnes: String(fullProfile.personnes ?? ""),
      objectifCA: String(fullProfile.objectifCA ?? ""),
      revenuActuel: String(fullProfile.revenuActuel ?? ""),
      caloriesCible: String(fullProfile.caloriesCible ?? ""),
      objectifSport,
    };
    await saveFullProfile(user.id, form, equipements);
    // Keep the route's own profile snapshot in sync with what was just
    // persisted, so a remount/re-render of ProfilEditScreen (e.g. if this
    // route is ever kept alive rather than fully unmounted) reflects the
    // saved values instead of the stale pre-save snapshot.
    setProfile({ ...form, equipements: fullProfile.equipements });
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <ProfilEditScreen profile={profile} onSave={handleSave} onBack={() => navigate("/home")} loading={loadingProfile} />;
}
