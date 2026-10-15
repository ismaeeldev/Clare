import { useEffect, useRef, useState } from "react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { saveFocusSession } from "@/lib/focusRepo";
import { loadLocal, saveLocal } from "@/lib/localStoragePlaceholder";
import { useEntitlement } from "@/hooks/useEntitlement";
import type { Task } from "@/lib/agendaRepo";
import type { FocusScreenProps, FocusSession } from "./types";

type FocusPhase = "setup" | "active" | "bilan";

const DUREES = [25, 45, 60, 90, 120];

/**
 * FocusSkeleton — shaped to match the real "setup" phase (purple header,
 * task-picker Card, duration Card) rather than a generic placeholder.
 * Found missing during a Step 1-8 UI-polish re-pass.
 */
function FocusSkeleton() {
  return (
    <div className="pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement du mode focus">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <div>
            <Skeleton width={100} height={12} className="mb-1" />
            <Skeleton width={140} height={24} />
          </div>
          <Skeleton width={90} height={26} radius="full" />
        </div>
      </div>
      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-5 py-6 sm:px-6">
        <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
          <Skeleton width={180} height={14} className="mb-3" />
          <div className="flex flex-col gap-2">
            <Skeleton width="100%" height={44} radius="lg" />
            <Skeleton width="100%" height={44} radius="lg" />
            <Skeleton width="100%" height={44} radius="lg" />
          </div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
          <Skeleton width={130} height={14} className="mb-3" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={40} radius="lg" />
            ))}
          </div>
        </div>
        <Skeleton width="100%" height={50} radius="xl" />
      </div>
    </div>
  );
}

/**
 * FocusScreen — Step 7.6, migrated onto real `focus_sessions` persistence
 * (docs/05_DataModel.md §2.13) and a real task picker (linked_task_id)
 * replacing the earlier free-text "what are you working on" field — the
 * schema has no column for free text, only a task reference, matching the
 * master prompt's own spec ("tied to a selected task from the tasks
 * table"). The live countdown/setup-active-bilan flow and the in-progress
 * "clare_focus_session" localStorage restore-on-mount (a genuine draft
 * recovery need, not a persistence gap — a session interrupted by a tab
 * close/refresh shouldn't lose its live countdown) are both preserved.
 */
export function FocusScreen({ userId, openTasks, onSessionDone, loading: loadingTasks = false, loadError, onRetryLoad }: FocusScreenProps) {
  // The focus timer itself (start/pause/end, duration, linked task) is
  // entirely free — only focus-assist's AI prep/bilan message is gated,
  // and that call already has a hardcoded fallback on any failure, so a
  // non-entitled user skips straight to the fallback rather than wasting
  // a round-trip on a call that would just 402.
  const { entitled: aiEntitled } = useEntitlement();
  const [phase, setPhase] = useState<FocusPhase>("setup");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [duree, setDuree] = useState(90);
  const [remaining, setRemaining] = useState(0);
  const [aiMsg, setAiMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTimeRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const session = await loadLocal<FocusSession>("clare_focus_session");
      if (session && session.endTime) {
        const remainingNow = Math.round((session.endTime - Date.now()) / 1000);
        if (remainingNow > 0) {
          const restoredTask = openTasks.find((t) => t.id === session.linkedTaskId) ?? null;
          setSelectedTask(restoredTask);
          setDuree(session.duree);
          setAiMsg(session.aiMsg || "");
          setRemaining(remainingNow);
          setSessionStartedAt(session.startedAt);
          endTimeRef.current = session.endTime;
          setPhase("active");
        } else {
          await saveLocal("clare_focus_session", null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore-on-mount only, deliberately runs once regardless of openTasks' later identity changes
  }, []);

  const startFocus = async () => {
    if (!selectedTask) return;
    setLoading(true);
    let text: string;
    if (!aiEntitled) {
      text = "C'est parti. Concentre-toi, mets ton téléphone en silencieux.";
    } else {
      try {
        const result = await callEdgeFunction<{ text: string }>("focus-assist", { mode: "prep", projet: selectedTask.title, duree });
        text = result.text;
      } catch {
        text = "C'est parti. Concentre-toi, mets ton téléphone en silencieux.";
      }
    }
    const startedAt = new Date().toISOString();
    setAiMsg(text);
    setSessionStartedAt(startedAt);
    const endTime = Date.now() + duree * 60 * 1000;
    await saveLocal("clare_focus_session", { linkedTaskId: selectedTask.id, duree, aiMsg: text, endTime, startedAt });
    endTimeRef.current = endTime;
    setRemaining(duree * 60);
    setPhase("active");
    setLoading(false);
  };

  // Recomputes remaining time from the stored target `endTime` rather than
  // naively decrementing a counter — a plain `setInterval` tick count drifts
  // (and, worse, can stall well past the real end) when the tab is
  // backgrounded, since browsers throttle timers in background tabs. Reading
  // from the authoritative end-timestamp on every tick, and re-syncing
  // immediately on `visibilitychange`, means the session always ends on time
  // (or snaps to correct the moment the tab regains focus) instead of
  // drifting with wall-clock time.
  useEffect(() => {
    if (phase !== "active") return;

    const tick = () => {
      const endTime = endTimeRef.current;
      if (endTime == null) return;
      const next = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPhase("bilan");
        saveLocal("clare_focus_session", null);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    intervalRef.current = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    tick();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [phase]);

  const endFocus = async () => {
    setLoading(true);
    setSaveError(false);
    await saveLocal("clare_focus_session", null);

    const endedAt = new Date().toISOString();
    const elapsedSeconds = duree * 60 - remaining;
    try {
      const saved = await saveFocusSession(userId, selectedTask?.id ?? null, sessionStartedAt ?? endedAt, endedAt, elapsedSeconds);
      onSessionDone?.(saved);
    } catch {
      // The save failed — this session won't appear in Stats' history.
      // Not worth blocking the bilan/wrap-up flow on it (the user can't
      // retry a background write from here), but it must not fail
      // silently: surface a non-blocking notice on the bilan screen below.
      setSaveError(true);
    }

    if (!aiEntitled) {
      setAiMsg("Bonne session. Note ta prochaine action concrète.");
    } else {
      try {
        const result = await callEdgeFunction<{ text: string }>("focus-assist", { mode: "bilan", projet: selectedTask?.title ?? "", duree, notes });
        setAiMsg(result.text);
      } catch {
        setAiMsg("Bonne session. Note ta prochaine action concrète.");
      }
    }
    setPhase("bilan");
    setLoading(false);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = phase === "active" ? ((duree * 60 - remaining) / (duree * 60)) * 100 : 0;

  if (loadingTasks) {
    return <FocusSkeleton />;
  }

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-text">
              Productivité & Immersion
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Mode Focus
            </h1>
          </div>
          <span className="inline-flex items-center rounded-full border border-purple/30 bg-purple-soft px-3 py-1 text-xs font-bold text-purple-text">
            {phase === "setup" ? "Préparation" : phase === "active" ? "Session en cours" : "Bilan"}
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-5 py-6 sm:px-6">
        {phase === "setup" && (
          <>
            <Card>
              <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-meta">
                Sur quelle tâche tu travailles ?
              </label>
              {openTasks.length === 0 && loadError ? (
                <InlineError message={loadError} onRetry={onRetryLoad} />
              ) : openTasks.length === 0 ? (
                <EmptyState icon="📋" title="Aucune tâche ouverte" description="Ajoute une tâche depuis l'Agenda pour démarrer une session focus." />
              ) : (
                <div className="flex flex-col gap-2">
                  {openTasks.map((task) => {
                    const isSelected = selectedTask?.id === task.id;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTask(task)}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 text-left font-ui text-sm font-semibold transition-all duration-180 cursor-pointer ${
                          isSelected
                            ? "border-2 border-purple bg-purple-soft/60 text-navy font-bold shadow-xs"
                            : "border border-border/80 bg-slate-50/50 text-text hover:border-purple/40 hover:bg-white"
                        }`}
                      >
                        <span className="truncate">{task.title}</span>
                        {isSelected && (
                          <span className="shrink-0 text-xs font-extrabold text-purple-text">✓ Sélectionné</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-meta">
                  Durée de la session
                </label>
                <span className="text-sm font-extrabold text-purple-text">{duree} minutes</span>
              </div>
              <div className="flex gap-2">
                {DUREES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuree(d)}
                    className={`flex-1 rounded-xl py-2.5 text-center font-ui text-xs font-bold transition-all cursor-pointer ${
                      duree === d
                        ? "bg-purple text-white shadow-sm font-extrabold"
                        : "border border-border/80 bg-slate-50/60 text-meta hover:border-purple/30 hover:text-navy"
                    }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </Card>

            <Button
              onClick={startFocus}
              disabled={!selectedTask || loading}
              className="w-full rounded-2xl bg-purple py-4 text-base font-extrabold text-white shadow-raised transition-all hover:bg-purple-600 hover:shadow-floating active:scale-[0.99] cursor-pointer"
            >
              {loading ? "Préparation de la session..." : "Lancer la session 🎯"}
            </Button>
          </>
        )}

        {phase === "active" && (
          <>
            {aiMsg && <AlertBox text={aiMsg} type="focus" />}

            <div className="py-6 text-center">
              <div
                className="relative mx-auto flex h-48 w-48 items-center justify-center rounded-full shadow-raised transition-all"
                style={{ background: `conic-gradient(var(--color-purple) ${progress}%, #e2e8f0 0%)` }}
              >
                <div className="flex h-[152px] w-[152px] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                  <span className="font-display text-[40px] font-extrabold text-navy tracking-tight tabular-nums">
                    {mm}:{ss}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-text">restantes</span>
                </div>
              </div>
              <div className="mt-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-soft px-3.5 py-1 text-xs font-bold text-purple-text">
                  <span>🎯</span> {selectedTask?.title}
                </span>
              </div>
            </div>

            <Card>
              <label htmlFor="focus-notes" className="mb-2 block text-xs font-bold uppercase tracking-wider text-meta">
                Notes & Idées rapides
              </label>
              <textarea
                id="focus-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Idées, blocages résolus, avancement..."
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-slate-50/50 p-3.5 text-sm text-navy placeholder:text-meta/60 outline-none focus:border-purple focus:bg-white transition-all"
              />
            </Card>

            <Button 
              onClick={endFocus} 
              disabled={loading} 
              className="w-full rounded-2xl bg-purple py-3.5 text-sm font-extrabold text-white shadow-raised transition-all hover:bg-purple-600 cursor-pointer"
            >
              {loading ? "Génération du bilan..." : "Terminer la session"}
            </Button>
          </>
        )}

        {phase === "bilan" && (
          <>
            <div className="py-4 text-center">
              <div className="text-5xl">🎯</div>
              <h2 className="mb-1 mt-3 font-display text-2xl font-extrabold text-navy">Session terminée !</h2>
              <p className="text-sm text-meta font-medium">
                {duree} minutes de focus intense · {selectedTask?.title}
              </p>
            </div>

            {saveError && (
              <AlertBox text="Cette session n'a pas pu être enregistrée dans ton historique (problème réseau). Ton bilan reste valable, mais elle n'apparaîtra pas dans Stats." type="warning" />
            )}

            {aiMsg && (
              <Card className="border border-purple/30 bg-purple-soft/60">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-purple-text text-base">◈</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-text">
                    BILAN CLARÉ
                  </span>
                </div>
                <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-navy font-medium">
                  {aiMsg}
                </p>
              </Card>
            )}

            <Button
              onClick={() => {
                setPhase("setup");
                setSelectedTask(null);
                setAiMsg("");
                setNotes("");
                setSaveError(false);
                setSessionStartedAt(null);
              }}
              className="w-full rounded-2xl bg-navy py-4 text-sm font-extrabold text-white shadow-raised transition-all hover:bg-navy-800 cursor-pointer"
            >
              Nouvelle session
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
