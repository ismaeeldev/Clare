import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { fetchQuietHours, saveQuietHours } from "@/lib/profileRepo";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { supabase } from "@/lib/supabase";
import {
  fetchIntegrations,
  startGoogleCalendarConnect,
  disconnectGoogleCalendar,
  syncGoogleCalendar,
  type IntegrationConnection,
} from "@/lib/integrationsRepo";
import { SettingsScreen, type DictationSupportStatus } from "./SettingsScreen";

function detectDictationSupport(): DictationSupportStatus {
  if (typeof window === "undefined") return "unknown";
  const w = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return w.SpeechRecognition || w.webkitSpeechRecognition ? "supported" : "unsupported";
}

/**
 * SettingsRoute — router-level wrapper for SettingsScreen (Step 7.6 / Step 9).
 * Account deletion signs the user out and redirects to /sign-in
 * immediately after the server confirms deletion.
 *
 * Google Calendar integration is real OAuth (google-oauth-start/-callback/
 * -disconnect + google-calendar-sync edge functions), not a client-side
 * status flag — a prior version of this screen flipped a DB status flag
 * and fabricated a fake `last_synced_at` timestamp from the client with no
 * real OAuth/webhook ever happening, which could mislead a user into
 * believing data was syncing when it never was (migration 0019 also
 * removed the client's insert/update policy on integration_connections so
 * that can't happen again even by accident). Strava is still "Bientôt" —
 * out of scope for this pass.
 */
export function SettingsRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [quietHours, setQuietHours] = useState({ start: "21:00", end: "08:00" });
  const [loadingData, setLoadingData] = useState(true);
  const [deletionState, setDeletionState] = useState<"idle" | "confirming" | "deleting" | "done">("idle");
  const [deletionError, setDeletionError] = useState("");

  const [loadError, setLoadError] = useState("");

  const [googleConnection, setGoogleConnection] = useState<IntegrationConnection | null>(null);
  const [googleActionState, setGoogleActionState] = useState<"idle" | "connecting" | "syncing" | "disconnecting">("idle");
  const [googleActionError, setGoogleActionError] = useState("");
  const [googleSyncSummary, setGoogleSyncSummary] = useState("");

  const loadIntegrations = async (userId: string) => {
    const connections = await fetchIntegrations(userId).catch(() => []);
    setGoogleConnection(connections.find((c) => c.provider === "google_calendar") ?? null);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const qh = await fetchQuietHours(user.id);
        setQuietHours(qh);
        setLoadError("");
      } catch (e) {
        // Previously unhandled: a failed fetch left loadingData=false (via
        // the old finally-only block) with the screen silently rendering
        // hardcoded 21:00-08:00 defaults, giving no sign the user's real
        // saved quiet hours failed to load — same silent-failure class as
        // lieux/notifications/routine's optimistic-mutation bug, here on
        // initial load instead.
        setLoadError(e instanceof Error ? e.message : "Impossible de charger tes réglages.");
      } finally {
        setLoadingData(false);
      }
      await loadIntegrations(user.id);
    })();
  }, [user, authLoading]);

  // Google redirects back to /settings?google_calendar=connected|error after
  // the OAuth consent flow (google-oauth-callback.ts's redirectToSettings).
  // On a successful connect, immediately trigger the first sync so the
  // user sees real imported events right away rather than a bare
  // "Connecté" label with an empty agenda until they notice a manual sync
  // button.
  useEffect(() => {
    if (authLoading || !user) return;
    const outcome = searchParams.get("google_calendar");
    if (!outcome) return;
    (async () => {
      setSearchParams({}, { replace: true });
      if (outcome === "connected") {
        await loadIntegrations(user.id);
        setGoogleActionState("syncing");
        try {
          const summary = await syncGoogleCalendar();
          setGoogleSyncSummary(`${summary.imported} événement${summary.imported > 1 ? "s" : ""} importé${summary.imported > 1 ? "s" : ""}.`);
          await loadIntegrations(user.id);
        } catch (e) {
          setGoogleActionError(e instanceof Error ? e.message : "La synchronisation a échoué.");
        } finally {
          setGoogleActionState("idle");
        }
      } else {
        setGoogleActionError("La connexion à Google Calendar a échoué ou a été annulée.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams intentionally excluded, same reasoning as BillingRoute's own checkout-return effect: re-running on every param change would restart this handling on the very setSearchParams call this effect itself makes.
  }, [user, authLoading]);

  const handleGoogleConnect = async () => {
    if (googleActionState !== "idle") return;
    setGoogleActionState("connecting");
    setGoogleActionError("");
    try {
      await startGoogleCalendarConnect(); // navigates the browser away to Google
    } catch (e) {
      setGoogleActionError(e instanceof Error ? e.message : "La connexion a échoué — réessaie.");
      setGoogleActionState("idle");
    }
  };

  const handleGoogleDisconnect = async () => {
    if (googleActionState !== "idle" || !user) return;
    setGoogleActionState("disconnecting");
    setGoogleActionError("");
    try {
      await disconnectGoogleCalendar();
      await loadIntegrations(user.id);
      setGoogleSyncSummary("");
    } catch (e) {
      setGoogleActionError(e instanceof Error ? e.message : "La déconnexion a échoué — réessaie.");
    } finally {
      setGoogleActionState("idle");
    }
  };

  const handleGoogleSync = async () => {
    if (googleActionState !== "idle" || !user) return;
    setGoogleActionState("syncing");
    setGoogleActionError("");
    try {
      const summary = await syncGoogleCalendar();
      setGoogleSyncSummary(`${summary.imported} événement${summary.imported > 1 ? "s" : ""} importé${summary.imported > 1 ? "s" : ""}.`);
      await loadIntegrations(user.id);
    } catch (e) {
      setGoogleActionError(e instanceof Error ? e.message : "La synchronisation a échoué — réessaie.");
    } finally {
      setGoogleActionState("idle");
    }
  };

  const handleSaveQuietHours = async (start: string, end: string) => {
    if (!user) return;
    await saveQuietHours(user.id, start, end);
    setQuietHours({ start, end });
  };
  // Errors from saveQuietHours propagate up unmodified — SettingsScreen's
  // own try/catch is what surfaces them via InlineError, so no catch is
  // needed at this layer.

  const handleConfirmDelete = async () => {
    // Irreversible action — guard against a double-click firing this twice
    // even in the narrow window before the "deleting" state re-render
    // actually unmounts the confirm button.
    if (deletionState === "deleting") return;
    setDeletionState("deleting");
    setDeletionError("");
    try {
      await callEdgeFunction("account-delete", {}, 20000);
      setDeletionState("done");
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/sign-in");
      }, 1800);
    } catch (e) {
      setDeletionError(e instanceof Error ? e.message : "La suppression a échoué — réessaie.");
      setDeletionState("confirming");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  const handleSignOut = async () => {
    // Same supabase.auth.signOut() path AppShell's desktop SideNavRail
    // onLogout already uses (which triggers useAuth's SIGNED_OUT listener
    // and its existing localStorage cleanup) — this is the mobile entry
    // point, since SideNavRail is desktop-only (lg:flex) and nothing else
    // on mobile could sign the user out before this.
    await supabase.auth.signOut();
    navigate("/sign-in");
  };

  return (
    <SettingsScreen
      quietHoursStart={quietHours.start}
      quietHoursEnd={quietHours.end}
      onSaveQuietHours={handleSaveQuietHours}
      loadError={loadError}
      dictationStatus={detectDictationSupport()}
      deletionState={deletionState}
      deletionError={deletionError}
      onRequestDelete={() => setDeletionState("confirming")}
      onConfirmDelete={handleConfirmDelete}
      onCancelDelete={() => setDeletionState("idle")}
      onSignOut={handleSignOut}
      onBack={() => navigate("/home")}
      loading={loadingData}
      googleConnection={googleConnection}
      googleActionState={googleActionState}
      googleActionError={googleActionError}
      googleSyncSummary={googleSyncSummary}
      onGoogleConnect={handleGoogleConnect}
      onGoogleDisconnect={handleGoogleDisconnect}
      onGoogleSync={handleGoogleSync}
    />
  );
}
