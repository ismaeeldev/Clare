import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  User, 
  Moon, 
  Mic, 
  Calendar, 
  Activity, 
  Download, 
  CreditCard, 
  Trash2, 
  ChevronRight, 
  ShieldCheck, 
  Clock, 
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  LogOut,
  ListChecks,
  MapPin
} from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import type { IntegrationConnection } from "@/lib/integrationsRepo";

export type DictationSupportStatus = "supported" | "unsupported" | "unknown";
export type GoogleActionState = "idle" | "connecting" | "syncing" | "disconnecting";

const QUIET_HOURS_PRESETS = [
  { label: "22h - 07h", start: "22:00", end: "07:00" },
  { label: "23h - 08h", start: "23:00", end: "08:00" },
  { label: "21h30 - 07h30", start: "21:30", end: "07:30" },
];

function SettingsSkeleton() {
  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement des réglages">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <Skeleton width={36} height={36} radius="md" />
          <Skeleton width={160} height={24} />
        </div>
      </div>
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Skeleton width="100%" height={120} radius="xl" />
            <Skeleton width="100%" height={100} radius="xl" />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Skeleton width="100%" height={160} radius="xl" />
            <Skeleton width="100%" height={120} radius="xl" />
            <Skeleton width="100%" height={180} radius="xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsScreen({
  quietHoursStart,
  quietHoursEnd,
  onSaveQuietHours,
  loadError,
  dictationStatus,
  deletionState,
  deletionError,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onSignOut,
  onBack,
  loading = false,
  googleConnection = null,
  googleActionState = "idle",
  googleActionError = "",
  googleSyncSummary = "",
  onGoogleConnect,
  onGoogleDisconnect,
  onGoogleSync,
}: {
  quietHoursStart: string;
  quietHoursEnd: string;
  onSaveQuietHours: (start: string, end: string) => Promise<void>;
  loadError?: string;
  dictationStatus: DictationSupportStatus;
  deletionState: "idle" | "confirming" | "deleting" | "done";
  deletionError: string;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSignOut: () => void;
  onBack: () => void;
  loading?: boolean;
  googleConnection?: IntegrationConnection | null;
  googleActionState?: GoogleActionState;
  googleActionError?: string;
  googleSyncSummary?: string;
  onGoogleConnect?: () => void;
  onGoogleDisconnect?: () => void;
  onGoogleSync?: () => void;
}) {
  const navigate = useNavigate();

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <SettingsForm
      quietHoursStart={quietHoursStart}
      quietHoursEnd={quietHoursEnd}
      onSaveQuietHours={onSaveQuietHours}
      loadError={loadError}
      dictationStatus={dictationStatus}
      deletionState={deletionState}
      deletionError={deletionError}
      onRequestDelete={onRequestDelete}
      onConfirmDelete={onConfirmDelete}
      onCancelDelete={onCancelDelete}
      onSignOut={onSignOut}
      onBack={onBack}
      navigate={navigate}
      googleConnection={googleConnection}
      googleActionState={googleActionState}
      googleActionError={googleActionError}
      googleSyncSummary={googleSyncSummary}
      onGoogleConnect={onGoogleConnect}
      onGoogleDisconnect={onGoogleDisconnect}
      onGoogleSync={onGoogleSync}
    />
  );
}

function SettingsForm({
  quietHoursStart,
  quietHoursEnd,
  onSaveQuietHours,
  loadError,
  dictationStatus,
  deletionState,
  deletionError,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onSignOut,
  onBack,
  navigate,
  googleConnection,
  googleActionState = "idle",
  googleActionError = "",
  googleSyncSummary = "",
  onGoogleConnect,
  onGoogleDisconnect,
  onGoogleSync,
}: {
  quietHoursStart: string;
  quietHoursEnd: string;
  onSaveQuietHours: (start: string, end: string) => Promise<void>;
  loadError?: string;
  dictationStatus: DictationSupportStatus;
  deletionState: "idle" | "confirming" | "deleting" | "done";
  deletionError: string;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSignOut: () => void;
  onBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
  googleConnection?: IntegrationConnection | null;
  googleActionState?: GoogleActionState;
  googleActionError?: string;
  googleSyncSummary?: string;
  onGoogleConnect?: () => void;
  onGoogleDisconnect?: () => void;
  onGoogleSync?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } catch {
      // onSignOut navigates on success; if supabase.auth.signOut() itself
      // throws, stay on this screen rather than pretending it worked.
      setSigningOut(false);
    }
  };
  const [start, setStart] = useState(quietHoursStart);
  const [end, setEnd] = useState(quietHoursEnd);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSaveQuietHours = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      await onSaveQuietHours(start, end);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (pStart: string, pEnd: string) => {
    setStart(pStart);
    setEnd(pEnd);
  };

  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
              Préférences & Sécurité
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Réglages & Compte
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        {loadError && (
          <InlineError message={`Impossible de charger tes heures calmes : ${loadError}`} className="mb-4" />
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Profile & Fast Shortcuts */}
          <div className="flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-24 self-start">
            {/* Profile Hub Card */}
            <Card
              onClick={() => navigate("/profile")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_18px_rgba(26,31,60,0.07)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy text-white shadow-xs">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-bold text-navy">Mon Profil Claré</h2>
                      <span className="rounded-md bg-gold/10 px-1.5 py-0.2 text-[10px] font-extrabold text-gold-text">
                        IA
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-meta leading-snug">
                      Identité, nutrition, sport & rythme de travail
                    </p>
                  </div>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </Card>

            {/* Quick Actions / Navigation Cards */}
            <Card
              onClick={() => navigate("/billing")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">Abonnement & Facturation</p>
                    <p className="text-[11px] text-meta">Gérer mon plan et mes paiements</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
              </div>
            </Card>

            <Card
              onClick={() => navigate("/historique")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-meta">
                    <Download className="h-4 w-4 text-navy" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">Exporter mes données</p>
                    <p className="text-[11px] text-meta">Journal et finances (CSV/JSON)</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
              </div>
            </Card>

            {/* Routine and Lieux have no entry point anywhere else in the
                app (not in DESKTOP_NAV_ITEMS, not in the mobile bottom tab
                bar's 5-item NAV_ITEMS, no link from Home) — both are real
                free features (ProtectedRoute only, no PremiumRoute), so
                this isn't an intentional gate, just a missing link. Added
                here as the closest fit to the existing Profile/Billing/
                Historique quick-links pattern. */}
            <Card
              onClick={() => navigate("/routine")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <ListChecks className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">Routine ménagère</p>
                    <p className="text-[11px] text-meta">Tâches récurrentes du foyer</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
              </div>
            </Card>

            <Card
              onClick={() => navigate("/lieux")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">Mes lieux récurrents</p>
                    <p className="text-[11px] text-meta">Trajets et rendez-vous habituels</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
              </div>
            </Card>

            {/* Privacy Badge */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-[11px] text-meta leading-relaxed">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>
                Données chiffrées de bout en bout. Aucun tracking publicitaire, Claré respecte strictement ta vie privée.
              </span>
            </div>

            {/* Sign out — the only mobile entry point (desktop also has
                SideNavRail's onLogout); kept low-emphasis (ghost/secondary,
                not destructive styling) so it doesn't compete visually with
                the account-deletion button below. */}
            <Button
              variant="secondary"
              size="md"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full justify-start gap-2.5 font-bold cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Déconnexion..." : "Se déconnecter"}
            </Button>
          </div>

          {/* Right Column: In-depth Settings */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            {/* 1. Quiet Hours */}
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy/10 text-navy">
                    <Moon className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-navy">Heures calmes & Notifications</h2>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-meta">
                  Protection sommeil
                </span>
              </div>
              <p className="text-xs text-meta mb-3.5">
                Aucune notification ni rappel automatique ne te sera envoyé durant cette plage horaire.
              </p>

              {/* Presets */}
              <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-meta mr-1">Suggestions :</span>
                {QUIET_HOURS_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.start, p.end)}
                    className="rounded-lg border border-border/70 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-navy transition-all hover:border-gold hover:bg-gold/10 hover:text-gold-text active:scale-95 cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Time Pickers */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="w-full flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-meta">
                    Début du calme
                  </label>
                  <div className="relative flex items-center">
                    <Clock className="absolute left-3 h-4 w-4 text-meta pointer-events-none" />
                    <input
                      type="time"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      aria-label="Heure de début"
                      className="w-full rounded-xl border border-border/90 bg-slate-50/70 py-2.5 pl-9 pr-3 text-sm font-bold text-navy outline-none focus:border-navy focus:bg-white focus:ring-2 focus:ring-navy/5 transition-all"
                    />
                  </div>
                </div>

                <span className="hidden sm:inline-block text-meta font-bold pt-4">→</span>

                <div className="w-full flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-meta">
                    Fin du calme
                  </label>
                  <div className="relative flex items-center">
                    <Clock className="absolute left-3 h-4 w-4 text-meta pointer-events-none" />
                    <input
                      type="time"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      aria-label="Heure de fin"
                      className="w-full rounded-xl border border-border/90 bg-slate-50/70 py-2.5 pl-9 pr-3 text-sm font-bold text-navy outline-none focus:border-navy focus:bg-white focus:ring-2 focus:ring-navy/5 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleSaveQuietHours} 
                  disabled={saving} 
                  className="w-full sm:w-auto px-5 py-2.5 font-bold cursor-pointer"
                >
                  {saving ? "Enregistrement..." : saved ? "✓ Horaires enregistrés" : "Enregistrer les horaires"}
                </Button>
                {saved && (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Sauvegardé
                  </span>
                )}
              </div>
              {saveError && <InlineError message={saveError} className="mt-2.5" />}
            </Card>

            {/* 2. Dictation Support */}
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 text-gold-text">
                    <Mic className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-navy">Dictée vocale & Saisie audio</h2>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    dictationStatus === "supported"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-meta"
                  }`}
                >
                  {dictationStatus === "supported" ? "✓ Activé & Compatible" : "Non disponible"}
                </span>
              </div>
              <p className="text-xs text-meta leading-relaxed">
                {dictationStatus === "supported"
                  ? "La reconnaissance vocale native est active. Tu peux utiliser le micro dans le journal et le vide-tête pour parler librement à Claré."
                  : "Ton navigateur actuel ne supporte pas la reconnaissance vocale native. Claré fonctionne de façon optimale avec la saisie clavier."}
              </p>
            </Card>

            {/* 3. Integrations */}
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy/10 text-navy">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-navy">Intégrations & Synchronisation</h2>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-meta">
                  Écosystème
                </span>
              </div>
              <p className="text-xs text-meta mb-3.5">
                Connecte tes outils favoris pour synchroniser tes plannings et ton activité physique.
              </p>

              {googleActionError && <InlineError message={googleActionError} className="mb-3" />}
              {googleSyncSummary && !googleActionError && (
                <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-green-soft p-2.5 text-[11px] font-semibold text-green-text">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{googleSyncSummary}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Google Calendar */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-navy">Google Calendar</p>
                        <p className="text-[10px] text-meta">
                          {googleConnection?.status === "connected"
                            ? googleConnection.last_synced_at
                              ? `Synchronisé ${new Date(googleConnection.last_synced_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                              : "Connecté"
                            : googleConnection?.status === "error"
                            ? "Erreur de connexion"
                            : "Agenda & RDV"}
                        </p>
                      </div>
                    </div>
                    {googleConnection?.status === "connected" || googleConnection?.status === "error" ? (
                      <span className="rounded-md bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green-text">
                        {googleConnection.status === "connected" ? "Connecté" : "Erreur"}
                      </span>
                    ) : null}
                  </div>
                  {googleConnection?.status === "connected" ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onGoogleSync}
                        disabled={googleActionState !== "idle"}
                        className="flex-1 text-[11px] font-bold cursor-pointer"
                      >
                        {googleActionState === "syncing" ? "Synchronisation..." : "Synchroniser"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onGoogleDisconnect}
                        disabled={googleActionState !== "idle"}
                        className="flex-1 text-[11px] font-bold cursor-pointer"
                      >
                        {googleActionState === "disconnecting" ? "..." : "Déconnecter"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onGoogleConnect}
                      disabled={googleActionState !== "idle"}
                      className="w-full text-[11px] font-bold cursor-pointer"
                    >
                      {googleActionState === "connecting" ? "Redirection..." : googleConnection?.status === "error" ? "Reconnecter" : "Connecter"}
                    </Button>
                  )}
                </div>

                {/* Strava */}
                <div className="flex items-center justify-between rounded-xl border border-border/80 bg-slate-50/60 p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">Strava & Sport</p>
                      <p className="text-[10px] text-meta">Courses & Séances</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-meta">
                    Bientôt
                  </span>
                </div>

                {/* Apple Health / Garmin */}
                <div className="flex items-center justify-between rounded-xl border border-border/80 bg-slate-50/60 p-3.5 sm:col-span-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                      <HeartPulse className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">Apple Health & Garmin</p>
                      <p className="text-[10px] text-meta">Sommeil, récupération & pas</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-meta">
                    Bientôt
                  </span>
                </div>
              </div>
            </Card>

            {/* 4. Danger Zone (Account Deletion) */}
            <Card className="rounded-2xl border border-red-200 bg-red-50/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-red-text">Zone de danger · Compte</h2>
              </div>

              {deletionState === "idle" && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-text-mid leading-relaxed">
                    Action irréversible. Toutes tes données (journal, finances, idées, tâches, routine) seront définitivement effacées.
                  </p>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={onRequestDelete} 
                    className="shrink-0 font-bold cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Supprimer mon compte
                  </Button>
                </div>
              )}

              {deletionState === "confirming" && (
                <div className="rounded-xl border border-red-300 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-red-text mb-1">
                    Es-tu absolument certain(e) de vouloir supprimer ton compte ?
                  </p>
                  <p className="text-xs text-text-mid leading-relaxed mb-3">
                    Cette action supprime définitivement ton journal, tes finances, tes tâches, ton agenda, tes idées, tes sessions focus et ton abonnement. Il sera impossible de récupérer ces données.
                  </p>
                  {deletionError && <InlineError message={deletionError} className="mb-3" />}
                  <div className="flex items-center gap-2.5">
                    <Button variant="secondary" size="sm" onClick={onCancelDelete} className="flex-1 font-bold cursor-pointer">
                      Annuler
                    </Button>
                    <Button variant="destructive" size="sm" onClick={onConfirmDelete} className="flex-1 font-bold cursor-pointer">
                      Oui, supprimer définitivement
                    </Button>
                  </div>
                </div>
              )}

              {deletionState === "deleting" && (
                <div className="flex items-center gap-2.5 py-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red border-t-transparent" />
                  <p className="text-xs font-bold text-red-text">Suppression de tes données en cours...</p>
                </div>
              )}

              {deletionState === "done" && (
                <div className="flex items-center gap-2 py-2 text-xs font-bold text-red-text">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Compte supprimé avec succès. Redirection vers la page de connexion...</span>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
