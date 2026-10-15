import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MicButton } from "@/components/ui/MicButton";
import { InlineError } from "@/components/ui/InlineError";
import { demarrerDictee, type DictationController } from "@/hooks/useDictation";
import { saveWorkoutResult, type JournalEntryRow } from "@/lib/journalRepo";
import { todayKey } from "@/lib/dateUtils";

/**
 * LiveWorkoutScreen — 04_ApplicationFlow.md §2.8, a genuinely missing flow
 * confirmed by a flow-doc audit (no timer/state-machine/per-set recording
 * ever existed; only a plain sport-status field in the Journal form). Full-
 * screen takeover per the doc, entered from Home's "Start" card or Journal's
 * workout block — never wrapped in AppShell's nav chrome while a session is
 * live, matching every other full-screen flow in this app (Sunday Prep).
 *
 * States: idle (ready, "TO BEAT" last session) → running (timer + big
 * central mic) → recording-set (tap→speak→tap, "Set #N" appended with a
 * timestamp) → finished (summary, writes to journal_entries via
 * saveWorkoutResult: sport ✓, duration, full free-text detail).
 */
export type WorkoutPhase = "idle" | "running" | "finished";

interface RecordedSet {
  n: number;
  text: string;
  atSeconds: number;
}

export interface LiveWorkoutScreenProps {
  userId: string;
  lastWorkout: JournalEntryRow | null;
  onExit: () => void;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LiveWorkoutScreen({ userId, lastWorkout, onExit }: LiveWorkoutScreenProps) {
  const [phase, setPhase] = useState<WorkoutPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sets, setSets] = useState<RecordedSet[]>([]);
  const [recordingSet, setRecordingSet] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [micError, setMicError] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dictationRef = useRef<DictationController | null>(null);
  const liveTranscriptRef = useRef("");
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      dictationRef.current?.arreter();
    };
  }, []);

  const startWorkout = () => {
    setPhase("running");
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
  };

  // Recomputes elapsed time from the stored `startTimeRef` timestamp on
  // every tick rather than naively incrementing a counter — a plain
  // `setInterval` counter drifts (or stalls) when the tab is backgrounded,
  // since browsers throttle timers in background tabs. Reading from the
  // authoritative start-timestamp on every tick, and re-syncing immediately
  // on `visibilitychange`, keeps the chrono accurate to wall-clock time
  // instead of drifting. Same pattern as FocusScreen's countdown timer.
  useEffect(() => {
    if (phase !== "running") return;

    const tick = () => {
      const startTime = startTimeRef.current;
      if (startTime == null) return;
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startTime) / 1000)));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    timerRef.current = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    tick();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phase]);

  const startRecordingSet = () => {
    if (recordingSet) return;
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    setMicError("");
    setRecordingSet(true);
    dictationRef.current = demarrerDictee({
      onTexte: (text) => {
        liveTranscriptRef.current = text;
        setLiveTranscript(text);
      },
      onEtat: (active) => {
        if (!active) setRecordingSet(false);
      },
      onErreur: (message) => {
        setMicError(message);
        setRecordingSet(false);
      },
    });
  };

  const stopRecordingSet = () => {
    dictationRef.current?.arreter();
    dictationRef.current = null;
    setRecordingSet(false);
    const text = liveTranscriptRef.current.trim();
    if (text) {
      setSets((prev) => [...prev, { n: prev.length + 1, text, atSeconds: elapsedSeconds }]);
    }
    setLiveTranscript("");
  };

  const deleteSet = (n: number) => {
    setSets((prev) => prev.filter((s) => s.n !== n).map((s, i) => ({ ...s, n: i + 1 })));
  };

  const persistWorkout = async () => {
    if (saving) return; // guard against double-fire (fast retry double-click)
    setSaving(true);
    setSaveError("");
    const detail = sets.map((s) => `Set ${s.n} (${formatDuration(s.atSeconds)}) — ${s.text}`).join("\n");
    try {
      await saveWorkoutResult(userId, todayKey(), detail, elapsedSeconds);
    } catch {
      // Never show the raw error — saveWorkoutResult's only failure path
      // is a Supabase error, not something meaningful to the user.
      setSaveError("L'enregistrement a échoué — tes sets restent affichés ici, réessaie.");
    } finally {
      setSaving(false);
    }
  };

  const finishWorkout = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    dictationRef.current?.arreter();
    setPhase("finished");
    await persistWorkout();
  };

  const requestExit = () => {
    if (phase === "running" || sets.length > 0) {
      setShowExitConfirm(true);
    } else {
      onExit();
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-navy font-ui text-white">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-navy/90 px-6 py-3.5 backdrop-blur-xl pt-[max(0.875rem,env(safe-area-inset-top))]">
        <button type="button" onClick={requestExit} className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white">
          ✕ Quitter
        </button>
        <p className="text-xs font-bold uppercase tracking-wider text-gold">🏃 Séance live</p>
        <div className="w-16" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
            {lastWorkout?.workout_detail ? (
              <div className="w-full rounded-2xl border border-gold/30 bg-white/[0.08] p-5 shadow-raised backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-gold text-base">◈</span>
                  <p className="text-xs font-bold uppercase tracking-wider text-gold">À battre — {lastWorkout.entry_date}</p>
                </div>
                <p className="whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-medium">{lastWorkout.workout_detail}</p>
                {lastWorkout.workout_duration_seconds ? (
                  <p className="mt-3 text-xs font-semibold text-white/60">Durée précédente : {formatDuration(lastWorkout.workout_duration_seconds)}</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-center">
                <p className="text-sm text-white/70">Première séance enregistrée ici — bon départ 💪</p>
              </div>
            )}
            <Button variant="accent" size="lg" onClick={startWorkout} className="w-full py-4 text-base font-extrabold shadow-gold-glow cursor-pointer">
              ▶ Démarrer la séance
            </Button>
          </motion.div>
        )}

        {phase === "running" && (
          <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-6 pb-10">
            <div className="mt-2 text-center">
              <p className="font-display text-[60px] font-extrabold tabular-nums tracking-tight text-white drop-shadow-md">
                {formatDuration(elapsedSeconds)}
              </p>
              <span className="text-xs font-bold uppercase tracking-wider text-gold">Chrono actif</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <MicButton active={recordingSet} onClick={recordingSet ? stopRecordingSet : startRecordingSet} size="md" variant="dark" className="h-20 w-20 shadow-raised" />
              <p className="text-xs font-medium text-white/70">{recordingSet ? "Écoute... tape pour valider le set" : "Tape le micro pour dicter un set"}</p>
            </div>

            {recordingSet && liveTranscript && (
              <p className="w-full rounded-xl border border-gold/40 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-gold">{liveTranscript}</p>
            )}
            {micError && <InlineError message={micError} />}

            <div className="w-full flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-1">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Sets enregistrés ({sets.length})</p>
              <AnimatePresence initial={false}>
                {sets.map((s) => (
                  <motion.div
                    key={s.n}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.08] p-3.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gold">Set #{s.n} — {formatDuration(s.atSeconds)}</p>
                      <p className="text-sm font-medium text-white/90">{s.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteSet(s.n)}
                      aria-label={`Supprimer le set ${s.n}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <Button variant="accent" size="lg" onClick={finishWorkout} fullWidth className="py-4 text-base font-extrabold shadow-gold-glow cursor-pointer">
              ✓ Terminer la séance
            </Button>
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div key="finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 pb-16 text-center">
            <div className="text-6xl">🔥</div>
            <h2 className="font-display text-2xl font-extrabold text-white">Séance terminée !</h2>
            <p className="text-sm font-medium text-white/80">{formatDuration(elapsedSeconds)} · {sets.length} set{sets.length > 1 ? "s" : ""} validé{sets.length > 1 ? "s" : ""}</p>
            {saving && <p className="text-xs text-gold animate-pulse">Enregistrement en cours...</p>}
            {saveError && (
              <div className="w-full">
                <InlineError message={saveError} onRetry={persistWorkout} />
              </div>
            )}
            <Button variant="accent" size="lg" onClick={onExit} className="w-full py-3.5 font-bold cursor-pointer">
              Retour au tableau de bord
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 py-[env(safe-area-inset-top)]">
          <Card className="w-full max-w-sm max-h-[85dvh] overflow-y-auto bg-white text-text">
            <p className="mb-1 text-sm font-bold text-navy">Quitter sans enregistrer ?</p>
            <p className="mb-4 text-[13px] text-text-mid">Ta séance en cours et tes sets déjà enregistrés seront perdus.</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowExitConfirm(false)}>
                Annuler
              </Button>
              <Button variant="primary" size="sm" className="flex-1" onClick={onExit}>
                Quitter
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
