import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Card } from "@/components/ui/Card";
import { EmojiSlider } from "@/components/ui/EmojiSlider";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { demarrerDictee, type DictationController } from "@/hooks/useDictation";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { todayFr, todayKey } from "@/lib/dateUtils";
import { ApiTimeoutError } from "@/lib/apiClient";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import {
  fetchEntryForDate,
  fetchLastWorkoutEntry,
  flushQueue,
  hasQueuedEntries,
  queueEntry,
  saveEntry,
  type JournalEntryRow,
  type NewJournalEntry,
} from "@/lib/journalRepo";
import type { JournalForm, JournalScreenProps } from "./types";

/**
 * JournalScreen — Step 3.4, rebuilt from the Step 1.3 structural port
 * (App.jsx lines 1484-1746) to fix the CLA-FR-011 defect that port's own
 * doc comment flagged: the original coupled the DB write to the AI call's
 * resolution (`onSave` only fired after `askClare` resolved). This version
 * implements the save-first pattern exactly: tapping "Enregistrer" writes
 * to `journal_entries` immediately with `ai_feedback_status='pending'`,
 * completely independent of any AI call. The async AI-feedback call
 * (journal-feedback Edge Function) fires only AFTER that save succeeds, as
 * a fire-and-forget request that never blocks saveState — a flow-doc audit
 * later found this backend half had never actually been built despite the
 * complete pending/ready/failed UI already existing here; journal-feedback
 * is that missing piece, added afterward.
 *
 * Offline-first: if useOnlineStatus is false when Save is tapped, the entry
 * is queued to localStorage instead of sent to Supabase, shows
 * "Enregistré (sera synchronisé) ✓", and auto-flushes once back online.
 *
 * `dicteeActive` stays the original's 3-state value (false | true | "sport")
 * distinguishing main-text dictation from sport-performance dictation.
 */
export function JournalScreen({ userId }: JournalScreenProps) {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { entitled: aiEntitled } = useEntitlement();
  const [feedbackBlockedByPlan, setFeedbackBlockedByPlan] = useState(false);
  const [loadingToday, setLoadingToday] = useState(true);
  const [refreshingToday, setRefreshingToday] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [today, setToday] = useState<JournalEntryRow | null>(null);
  const [lastWorkout, setLastWorkout] = useState<JournalEntryRow | null>(null);
  const [form, setForm] = useState<JournalForm>({
    texte: "",
    depenses: "",
    revenus: "",
    sport: "non",
    energie: 3,
    humeur: 3,
    repas: "",
    projet: "",
    performance: "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "queued" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [dicteeActive, setDicteeActive] = useState<boolean | "sport">(false);
  const recognitionRef = useRef<DictationController | null>(null);

  const applyEntry = (entry: JournalEntryRow | null) => {
    if (!entry) return;
    setForm({
      texte: entry.text_content || "",
      depenses: entry.expenses !== null ? String(entry.expenses) : "",
      revenus: entry.revenue !== null ? String(entry.revenue) : "",
      sport: (entry.workout_status as JournalForm["sport"]) || "non",
      energie: entry.energy || 3,
      humeur: entry.mood || 3,
      repas: entry.meals_note || "",
      projet: entry.project_touched || "",
      performance: entry.workout_detail || "",
    });
  };

  // Guards a fast userId change (sign-out/sign-in as a different user
  // without a full page reload) from applying a slower, now-stale
  // response for the PREVIOUS user after a newer load has already
  // started — same pattern AgendaScreen/ChatScreen already use for their
  // own request races.
  const loadRequestRef = useRef(0);

  const loadToday = async (isManual = false) => {
    // Manual refresh must never silently clobber text the user hasn't
    // saved yet (bug found in this pass: tapping ↻ while mid-entry wiped
    // the textarea back to whatever was last persisted). Explicit-save-only
    // screens like this one have no autosave to fall back on, so this
    // check is the only thing standing between a refresh tap and data loss.
    if (isManual === true && form.texte.trim() && saveState !== "saved" && saveState !== "queued") {
      const proceed = window.confirm(
        "Tu as du texte non enregistré. Actualiser va le remplacer par la dernière version enregistrée. Continuer ?"
      );
      if (!proceed) return;
    }
    const requestId = ++loadRequestRef.current;
    if (isManual || today) {
      setRefreshingToday(true);
    } else {
      setLoadingToday(true);
    }
    setLoadError("");
    try {
      const [entry, lastWo] = await Promise.all([fetchEntryForDate(userId, todayKey()), fetchLastWorkoutEntry(userId, todayKey())]);
      if (loadRequestRef.current !== requestId) return;
      setToday(entry);
      applyEntry(entry);
      setLastWorkout(lastWo);
      if (entry) setSaveState("saved");
    } catch (err) {
      if (loadRequestRef.current !== requestId) return;
      setLoadError(err instanceof ApiTimeoutError ? "Le chargement prend trop de temps. Vérifie ta connexion et réessaie." : "Le chargement a échoué.");
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoadingToday(false);
        setRefreshingToday(false);
      }
    }
  };

  useEffect(() => {
    (async () => {
      await loadToday();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Auto-flush the offline queue: on every online-state transition to true
  // (the common case — device regains connectivity), AND once on mount
  // (covers the case where an entry got queued from a genuine write
  // failure while nominally online — e.g. an RLS/constraint rejection —
  // so it doesn't sit stuck until the user happens to toggle connectivity;
  // found during Step 3's post-completion bug hunt, since that path
  // previously had no way to ever flush without an actual offline→online
  // edge occurring).
  useEffect(() => {
    if (!isOnline || !hasQueuedEntries()) return;
    (async () => {
      const synced = await flushQueue(userId);
      if (synced > 0) setSaveState("saved");
    })();
  }, [isOnline, userId]);

  const set = <K extends keyof JournalForm>(k: K, v: JournalForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDictee = () => {
    // `dicteeActive` only flips true after the browser's async onstart
    // fires, so a fast double-tap before that event lands could otherwise
    // call demarrerDictee twice — the first controller would leak (left
    // running, auto-restarting itself forever) since recognitionRef.current
    // just gets overwritten. recognitionRef.current itself is set
    // synchronously on click, so gate on that instead of on state.
    if (dicteeActive || recognitionRef.current) {
      recognitionRef.current?.arreter();
      recognitionRef.current = null;
      return;
    }
    recognitionRef.current = demarrerDictee({
      texteInitial: form.texte,
      onTexte: (t) => set("texte", t),
      onEtat: (actif) => {
        setDicteeActive(actif);
        if (!actif) recognitionRef.current = null;
      },
      onErreur: (m) => alert(m),
    });
  };

  const toggleDicteePerformance = () => {
    if (dicteeActive === "sport" || recognitionRef.current) {
      recognitionRef.current?.arreter();
      recognitionRef.current = null;
      return;
    }
    recognitionRef.current = demarrerDictee({
      texteInitial: form.performance,
      onTexte: (t) => set("performance", t),
      onEtat: (actif) => {
        setDicteeActive(actif ? "sport" : false);
        if (!actif) recognitionRef.current = null;
      },
      onErreur: (m) => alert(m),
    });
  };

  const buildEntry = (): NewJournalEntry => ({
    entry_date: todayKey(),
    text_content: form.texte,
    energy: form.energie,
    mood: form.humeur,
    revenue: Number(form.revenus) || 0,
    expenses: Number(form.depenses) || 0,
    meals_note: form.repas,
    project_touched: form.projet,
    workout_status: form.sport === "léger" ? "light" : form.sport === "oui" ? "done" : "none",
    workout_detail: form.performance,
  });

  const requestAnalysis = async (entryDate?: string) => {
    const targetDate = entryDate || today?.entry_date || todayKey();
    if (analyzing) return;
    if (!aiEntitled) {
      // Not a real failure, so don't write ai_feedback_status="failed"
      // (that column is a DB check-constraint — "pending"/"ready"/"failed"
      // only, not something to extend here). Track it locally instead so
      // the UI can show the real reason without a schema change.
      setFeedbackBlockedByPlan(true);
      return;
    }
    setFeedbackBlockedByPlan(false);
    setAnalyzing(true);
    try {
      const res = await callEdgeFunction<{ ai_feedback?: string; skipped?: string }>(
        "journal-feedback",
        { entry_date: targetDate },
        30000
      );
      if (res?.ai_feedback) {
        const feedback = res.ai_feedback;
        setToday((prev) =>
          prev
            ? { ...prev, ai_feedback: feedback, ai_feedback_status: "ready" }
            : null
        );
      } else {
        const refreshed = await fetchEntryForDate(userId, targetDate);
        if (refreshed) setToday(refreshed);
      }
    } catch {
      setToday((prev) => (prev ? { ...prev, ai_feedback_status: "failed" } : null));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaveState("saving");
    setSaveError("");
    const entry = buildEntry();

    if (!isOnline) {
      queueEntry(userId, entry);
      setSaveState("queued");
      return;
    }

    try {
      const saved = await saveEntry(userId, entry);
      setToday(saved);
      setSaveState("saved");
      void requestAnalysis(entry.entry_date);
    } catch (err) {
      // Reliability guarantee (CLA-FR-011): the entry is never lost, no
      // matter why the write failed — it's always queued. But a genuine
      // rejection (bad data, an RLS/constraint violation) is a different
      // situation from a transient network/timeout failure: queuing it
      // silently as "queued ✓" would hide a real problem that a retry
      // will never fix on its own (bug found + fixed during Step 3's
      // post-completion bug hunt — this used to always show the same
      // success-shaped "queued" message for both cases, and saveError was
      // dead state that could never actually render).
      queueEntry(userId, entry);
      if (err instanceof ApiTimeoutError) {
        setSaveState("queued");
      } else {
        setSaveState("error");
        setSaveError("L'enregistrement en ligne a échoué — ta journée a quand même été gardée en local et sera synchronisée automatiquement, mais vérifie ta connexion.");
      }
    }
  };

  const derniereSeance = lastWorkout;

  if (loadingToday && !today) {
    return (
      <div className="pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement du journal">
        <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                {todayFr()}
              </span>
              <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
                Journal quotidien
              </h1>
            </div>
            <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-4 lg:col-span-7">
              <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <Skeleton width={140} height={14} />
                  <Skeleton width={80} height={28} radius="full" />
                </div>
                <Skeleton width="100%" height={110} radius="lg" />
              </div>
              <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Skeleton width={130} height={14} className="mb-2" />
                    <Skeleton width="100%" height={40} radius="lg" />
                  </div>
                  <div>
                    <Skeleton width={120} height={14} className="mb-2" />
                    <Skeleton width="100%" height={40} radius="lg" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 lg:col-span-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
                  <Skeleton width={80} height={12} className="mb-2" />
                  <Skeleton width="60%" height={32} radius="md" />
                </div>
                <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
                  <Skeleton width={80} height={12} className="mb-2" />
                  <Skeleton width="60%" height={32} radius="md" />
                </div>
              </div>
              <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
                <Skeleton width={120} height={14} className="mb-3" />
                <Skeleton width="100%" height={44} radius="xl" className="mb-4" />
                <Skeleton width={120} height={14} className="mb-3" />
                <Skeleton width="100%" height={44} radius="xl" />
              </div>
              <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
                <Skeleton width={120} height={14} className="mb-3" />
                <Skeleton width="100%" height={36} radius="lg" />
              </div>
              <Skeleton width="100%" height={48} radius="xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                {todayFr()}
              </span>
              {refreshingToday && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Journal quotidien
            </h1>
          </div>
          <button
            type="button"
            onClick={() => loadToday(true)}
            disabled={loadingToday || refreshingToday}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
            aria-label="Actualiser la journée"
            title="Actualiser"
          >
            <RefreshCw size={15} className={refreshingToday ? "animate-spin text-gold" : "text-navy"} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        {loadError && <InlineError message={loadError} onRetry={loadToday} />}
        {saveState === "saved" && <AlertBox text="Enregistré ✓" type="success" />}
        {saveState === "queued" && <AlertBox text="Enregistré (sera synchronisé) ✓" type="info" />}

        <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column (Main text + context) */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="journal-texte" className="text-xs font-bold uppercase tracking-wider text-meta">
                  Raconte ta journée
                </label>
                <button
                  type="button"
                  onClick={toggleDictee}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 cursor-pointer ${
                    dicteeActive === true
                      ? "bg-red-solid text-white shadow-sm ring-2 ring-red/30"
                      : "bg-navy text-gold hover:bg-navy-800 shadow-xs"
                  }`}
                >
                  {dicteeActive === true ? (
                    <>
                      <span className="h-2 w-2 animate-ping rounded-full bg-white" /> Stop
                    </>
                  ) : (
                    <>🎙️ Dicter</>
                  )}
                </button>
              </div>
              {dicteeActive === true && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-soft px-3.5 py-2">
                  <div className="h-2 w-2 shrink-0 animate-ping rounded-full bg-red-solid" />
                  <p className="text-xs font-semibold text-red-text">Écoute en cours — parle naturellement...</p>
                </div>
              )}
              <textarea
                id="journal-texte"
                value={form.texte}
                onChange={(e) => set("texte", e.target.value)}
                placeholder={dicteeActive === true ? "Ta voix s'affiche ici..." : "RDV, projets avancés, obstacles, victoires, ressentis... ou dicte 🎙️"}
                rows={5}
                className={`w-full resize-none rounded-xl p-3.5 text-sm text-navy placeholder:text-meta/60 outline-none transition-all duration-200 ${
                  dicteeActive === true
                    ? "border-2 border-red-solid bg-red-soft/30"
                    : form.texte
                      ? "border border-navy/40 bg-slate-50/50 focus:border-navy focus:bg-white"
                      : "border border-border bg-slate-50/50 focus:border-navy focus:bg-white"
                }`}
              />
            </Card>

            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="journal-projet" className="mb-2 block text-xs font-bold uppercase tracking-wider text-meta">
                    🎯 Projet principal avancé
                  </label>
                  <input
                    id="journal-projet"
                    value={form.projet}
                    onChange={(e) => set("projet", e.target.value)}
                    placeholder="ex : CourtierTravaux — landing page"
                    className="w-full rounded-xl border border-border bg-slate-50/50 px-3.5 py-2.5 text-sm text-navy placeholder:text-meta/60 outline-none focus:border-navy focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="journal-repas" className="mb-2 block text-xs font-bold uppercase tracking-wider text-meta">
                    🍽️ Repas du jour
                  </label>
                  <input
                    id="journal-repas"
                    value={form.repas}
                    onChange={(e) => set("repas", e.target.value)}
                    placeholder="ex : poulet riz midi, pâtes..."
                    className="w-full rounded-xl border border-border bg-slate-50/50 px-3.5 py-2.5 text-sm text-navy placeholder:text-meta/60 outline-none focus:border-navy focus:bg-white transition-all"
                  />
                </div>
              </div>
            </Card>

            {today && (
              <Card className="rounded-2xl border border-gold/40 bg-gold-soft/50 p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gold-text text-base">◈</span>
                    <span className="text-xs font-extrabold tracking-wider uppercase text-gold-text">CLARÉ ANALYSE</span>
                  </div>
                  {today.ai_feedback && (
                    <button
                      type="button"
                      onClick={() => requestAnalysis(today.entry_date)}
                      disabled={analyzing}
                      className="text-[11px] font-bold text-gold-text hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {analyzing ? "Analyse..." : "Réanalyser"}
                    </button>
                  )}
                </div>

                {analyzing ? (
                  <div className="flex items-center gap-2.5 py-1">
                    <div className="h-2.5 w-2.5 animate-ping rounded-full bg-gold shrink-0" />
                    <p className="m-0 text-xs font-semibold text-navy">
                      Claré analyse ta journée en profondeur...
                    </p>
                  </div>
                ) : feedbackBlockedByPlan && today.ai_feedback_status !== "ready" ? (
                  <UpgradePrompt message="L'analyse personnalisée de ta journée par Claré est réservée aux membres Premium." />
                ) : today.ai_feedback_status === "ready" && today.ai_feedback ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy font-medium m-0">
                    {today.ai_feedback}
                  </p>
                ) : today.ai_feedback_status === "failed" ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <p className="text-xs text-meta m-0">L'analyse n'a pas pu aboutir cette fois-ci.</p>
                    <button
                      type="button"
                      onClick={() => requestAnalysis(today.entry_date)}
                      className="rounded-lg bg-navy px-2.5 py-1 text-[11px] font-bold text-gold hover:bg-navy-800 cursor-pointer shadow-xs"
                    >
                      🔄 Réessayer l'analyse
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <p className="text-xs text-meta m-0">Prêt pour l'analyse personnalisée de Claré.</p>
                    <button
                      type="button"
                      onClick={() => requestAnalysis(today.entry_date)}
                      className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-gold hover:bg-navy-800 cursor-pointer shadow-xs"
                    >
                      ✦ Lancer l'analyse →
                    </button>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right Column (Finances, Energy/Mood, Sport, Action) */}
          <div className="flex flex-col gap-4 lg:col-span-5 lg:sticky lg:top-24 self-start">
            {/* Finances Strip */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                <label htmlFor="journal-revenus" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-meta">
                  💰 Revenus (€)
                </label>
                <input
                  id="journal-revenus"
                  type="number"
                  value={form.revenus}
                  onChange={(e) => set("revenus", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border/80 bg-slate-50/60 px-3 py-2 text-lg font-extrabold text-green-text outline-none focus:border-navy focus:bg-white transition-all"
                />
              </Card>
              <Card className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                <label htmlFor="journal-depenses" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-meta">
                  💶 Dépenses (€)
                </label>
                <input
                  id="journal-depenses"
                  type="number"
                  value={form.depenses}
                  onChange={(e) => set("depenses", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border/80 bg-slate-50/60 px-3 py-2 text-lg font-extrabold text-red-text outline-none focus:border-navy focus:bg-white transition-all"
                />
              </Card>
            </div>

            {/* Énergie & Humeur */}
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
              <div className="flex flex-col gap-5">
                <EmojiSlider
                  value={form.energie}
                  onChange={(v) => set("energie", v)}
                  emojis={["😴", "😕", "😐", "😊", "🔥"]}
                  label="Énergie physique"
                />
                <div className="border-t border-border/60 pt-4">
                  <EmojiSlider
                    value={form.humeur}
                    onChange={(v) => set("humeur", v)}
                    emojis={["😞", "😔", "😐", "🙂", "😄"]}
                    label="Humeur / mental"
                  />
                </div>
              </div>
            </Card>

            {/* Sport & Performance - Centered and nicely formatted */}
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex w-full items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-meta">
                    🏋️ Séance sport
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate("/workout")}
                    className="rounded-xl bg-green px-3 py-1.5 text-xs font-bold text-navy shadow-xs transition-all hover:bg-green-600 hover:text-white cursor-pointer"
                  >
                    🏃 Séance live
                  </button>
                </div>

                {/* Centered Segmented Toggle */}
                <div className="flex w-full justify-center gap-2 rounded-xl bg-slate-100/80 p-1">
                  {(["non", "léger", "oui"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("sport", v)}
                      className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                        form.sport === v
                          ? v === "oui"
                            ? "bg-green text-navy shadow-sm font-extrabold"
                            : v === "léger"
                              ? "bg-gold text-navy shadow-sm font-extrabold"
                              : "bg-navy text-white shadow-sm font-extrabold"
                          : "text-meta hover:text-navy"
                      }`}
                    >
                      {v === "oui" ? "✅ Faite" : v === "léger" ? "🚶 Légère" : "❌ Non"}
                    </button>
                  ))}
                </div>
              </div>

              {form.sport !== "non" && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-meta">Performance de la séance</label>
                    <button
                      type="button"
                      onClick={toggleDicteePerformance}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                        dicteeActive === "sport" ? "bg-red-solid text-white" : "bg-navy text-gold hover:bg-navy-800"
                      }`}
                    >
                      {dicteeActive === "sport" ? "⏹ Stop" : "🎙️ Dicter"}
                    </button>
                  </div>

                  {dicteeActive === "sport" && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-soft px-3 py-1.5">
                      <div className="h-2 w-2 shrink-0 animate-ping rounded-full bg-red-solid" />
                      <p className="text-xs font-semibold text-red-text">Écoute... Dicte tes exercices</p>
                    </div>
                  )}

                  <textarea
                    value={form.performance || ""}
                    onChange={(e) => set("performance", e.target.value)}
                    placeholder="Ex: développé couché 3×10 à 80kg, tirage 3×12 à 60kg..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border bg-slate-50/50 p-3 text-sm text-navy placeholder:text-meta/60 outline-none focus:border-navy focus:bg-white transition-all"
                  />

                  {derniereSeance && (
                    <div className="mt-2.5 rounded-xl border border-green/30 bg-green-soft px-3.5 py-2.5">
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-green-text">
                        DERNIÈRE SÉANCE —{" "}
                        {new Date(derniereSeance.entry_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                      <p className="text-xs text-text-mid font-medium">{derniereSeance.workout_detail}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {saveError && <InlineError message={saveError} onRetry={handleSave} />}

            <Button 
              variant="primary" 
              size="lg" 
              onClick={handleSave} 
              disabled={saveState === "saving" || !form.texte.trim()} 
              fullWidth
              className="py-3.5 text-sm font-extrabold shadow-raised cursor-pointer rounded-xl"
            >
              {saveState === "saving" ? "Enregistrement en cours..." : "Enregistrer la journée"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
