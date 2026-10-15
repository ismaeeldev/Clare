import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  createCalendarItem,
  createTask,
  deleteCalendarItem,
  deleteTask,
  fetchOpenTasks,
  fetchWeekCalendarItems,
  toggleTaskDone,
  type CalendarItem,
  type Task,
} from "@/lib/agendaRepo";
import { ApiTimeoutError } from "@/lib/apiClient";
import { formatWeekRangeFr, getWeekEnd, getWeekStart } from "@/lib/dateUtils";
import { findOverlappingIds } from "@/lib/agendaConflicts";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import type { AgendaScreenProps } from "./types";

type NewItemKind = "calendar" | "task";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function AgendaWeekSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6 font-ui" role="status" aria-label="Chargement de l'agenda">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-3 lg:col-span-7">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
              <Skeleton width={48} height={44} radius="xl" />
              <div className="flex-1">
                <Skeleton width="65%" height={15} className="mb-2" />
                <Skeleton width="35%" height={11} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
            <Skeleton width={130} height={16} className="mb-3" />
            <Skeleton width="100%" height={36} radius="lg" className="mb-2" />
            <Skeleton width="100%" height={36} radius="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AgendaScreen — Step 3.3. Week view, manual create/delete for both tasks
 * and calendar_items, per docs/04_ApplicationFlow.md §2.5. Overlap
 * detection (findOverlappingIds) is deterministic/client-side; the
 * read-only commentary text on tap comes from the agenda-conflict Edge
 * Function — Claré never auto-resolves a conflict, only suggests.
 */
export function AgendaScreen({ userId }: AgendaScreenProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<NewItemKind>("calendar");
  const [titleInput, setTitleInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const { entitled: aiEntitled } = useEntitlement();
  // Conflict commentary (04_ApplicationFlow.md §2.5): which item's chip is
  // expanded, and the fetched/loading/failed text per item id — fetched
  // lazily on tap, never eagerly for every overlapping pair.
  const [openConflictId, setOpenConflictId] = useState<string | null>(null);
  const [conflictText, setConflictText] = useState<Record<string, string>>({});
  // Keyed per item id (not a single scalar) — a single shared "which item is
  // loading" value previously caused tapping a second conflicting chip while
  // the first was still in flight to make the first chip's loading
  // indicator disappear prematurely (its own fetch was still pending).
  const [conflictLoading, setConflictLoading] = useState<Record<string, boolean>>({});
  const [conflictError, setConflictError] = useState<Record<string, string>>({});
  // Separate from conflictError on purpose — "needs upgrade" is an
  // entitlement gate, not a fetch failure, so it gets its own map instead of
  // a sentinel string sharing conflictError's slot (which could collide with
  // a future real error message and makes the two states harder to tell apart).
  const [conflictGated, setConflictGated] = useState<Record<string, boolean>>({});
  // Per-task pending set — prevents a rapid double-tap on a checkbox from
  // firing two toggleTaskDone calls with opposite states, whose responses
  // could resolve out of order and leave the displayed state wrong.
  const [togglingTaskIds, setTogglingTaskIds] = useState<Set<string>>(new Set());

  const weekStart = getWeekStart(weekOffset);
  const weekEnd = getWeekEnd(weekStart);

  // Guards the week-switch race: if the user flips weeks quickly, an older
  // request's response can resolve after a newer one and overwrite state
  // with a stale week's items. Each load() call captures the weekOffset it
  // was issued for and discards its result if a newer weekOffset has since
  // superseded it.
  const loadRequestRef = useRef(0);

  const load = async (isManualRefresh = false) => {
    const requestId = ++loadRequestRef.current;
    if (isManualRefresh || calendarItems.length > 0 || tasks.length > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError("");
    try {
      const [items, openTasks] = await Promise.all([
        fetchWeekCalendarItems(userId, weekStart.toISOString(), weekEnd.toISOString()),
        fetchOpenTasks(userId),
      ]);
      if (loadRequestRef.current !== requestId) return; // superseded by a newer load — discard
      setCalendarItems(items);
      setTasks(openTasks);
    } catch (err) {
      if (loadRequestRef.current !== requestId) return;
      setLoadError(err instanceof ApiTimeoutError ? "Le chargement prend trop de temps. Vérifie ta connexion et réessaie." : "Le chargement a échoué.");
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, userId]);

  const resetAddForm = () => {
    setTitleInput("");
    setDateInput("");
    setTimeInput("");
    setSaveError("");
  };

  const handleCreate = async () => {
    if (!titleInput.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      if (addKind === "calendar") {
        if (!dateInput) throw new Error("MISSING_DATE");
        const startsAt = new Date(`${dateInput}T${timeInput || "09:00"}`);
        const created = await createCalendarItem(userId, { title: titleInput.trim(), starts_at: startsAt.toISOString() });
        setCalendarItems((prev) => [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      } else {
        const created = await createTask(userId, { title: titleInput.trim(), due_date: dateInput || null });
        setTasks((prev) => [...prev, created]);
      }
      resetAddForm();
      setShowAdd(false);
    } catch (err) {
      if (err instanceof Error && err.message === "MISSING_DATE") {
        setSaveError("Choisis une date.");
      } else if (err instanceof ApiTimeoutError) {
        setSaveError("L'ajout prend trop de temps. Vérifie ta connexion et réessaie.");
      } else {
        setSaveError("L'ajout a échoué. Réessaie.");
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCalendarItem = async (id: string) => {
    setPendingDeleteId(null);
    setCalendarItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await deleteCalendarItem(id);
    } catch {
      // Restore on failure — reload from source of truth rather than guess.
      load();
    }
  };

  const confirmDeleteTask = async (id: string) => {
    setPendingDeleteId(null);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
    } catch {
      load();
    }
  };

  const handleToggleTask = async (task: Task) => {
    if (togglingTaskIds.has(task.id)) return;
    setTogglingTaskIds((prev) => new Set(prev).add(task.id));
    const nextDone = task.status !== "done";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextDone ? "done" : "open" } : t)));
    try {
      await toggleTaskDone(task.id, nextDone);
    } catch {
      load();
    } finally {
      setTogglingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const isEmpty = !loading && calendarItems.length === 0 && tasks.length === 0;
  const overlappingIds = findOverlappingIds(calendarItems);

  const handleToggleConflict = async (item: CalendarItem) => {
    if (openConflictId === item.id) {
      setOpenConflictId(null);
      return;
    }
    setOpenConflictId(item.id);
    // Skip only while a fetch is genuinely in flight or already succeeded —
    // a previous error must NOT be cached here, or a failing chip could
    // never be retried by the user at all (it would just silently do
    // nothing on every subsequent tap).
    if (conflictText[item.id] || conflictLoading[item.id]) return;

    const other = calendarItems.find((i) => i.id !== item.id && overlappingIds.has(i.id) && new Date(i.starts_at).getTime() < new Date(item.ends_at ?? item.starts_at).getTime() && new Date(item.starts_at).getTime() < new Date(i.ends_at ?? i.starts_at).getTime());
    if (!other) return;

    if (!aiEntitled) {
      setConflictGated((prev) => ({ ...prev, [item.id]: true }));
      return;
    }

    setConflictGated((prev) => ({ ...prev, [item.id]: false }));
    setConflictLoading((prev) => ({ ...prev, [item.id]: true }));
    setConflictError((prev) => ({ ...prev, [item.id]: "" }));
    try {
      const { text } = await callEdgeFunction<{ text: string }>("agenda-conflict", {
        item_a: item.title,
        time_a: new Date(item.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        item_b: other.title,
        time_b: new Date(other.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      });
      setConflictText((prev) => ({ ...prev, [item.id]: text }));
    } catch {
      setConflictError((prev) => ({ ...prev, [item.id]: "Impossible de charger la suggestion de Claré." }));
    } finally {
      setConflictLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                  Organisation & Calendrier
                </span>
                {refreshing && (
                  <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
                )}
              </div>
              <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
                Agenda
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loading || refreshing}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                aria-label="Actualiser l'agenda"
                title="Actualiser"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
              </button>
              {isOnline ? (
                <Button variant="accent" size="sm" onClick={() => setShowAdd(!showAdd)}>
                  + Ajouter
                </Button>
              ) : (
                <div className="group relative">
                  <Button variant="accent" size="sm" disabled>
                    + Ajouter
                  </Button>
                  <p className="absolute right-0 top-full mt-1 w-max max-w-[200px] rounded-md bg-navy px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Connecte-toi à internet pour ajouter un événement
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Week Navigation Strip */}
          <div className="flex items-center justify-between rounded-xl bg-slate-100/90 px-3 py-1.5 text-xs font-bold text-navy">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-navy shadow-xs transition-all hover:bg-bg-dark cursor-pointer"
              aria-label="Semaine précédente"
            >
              ←
            </button>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-extrabold text-navy">
                {formatWeekRangeFr(weekStart, weekEnd)}
              </span>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[10px] font-extrabold text-gold-text transition-all hover:bg-gold hover:text-navy cursor-pointer"
                >
                  Aujourd'hui
                </button>
              )}
            </div>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-navy shadow-xs transition-all hover:bg-bg-dark cursor-pointer"
              aria-label="Semaine suivante"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        {showAdd && (
          <Card style={{ border: "1.5px solid var(--color-gold)" }}>
            <h3 className="mb-3.5 text-sm font-bold text-navy">Nouvel élément</h3>
            <div className="mb-3 flex gap-1.5">
              <button
                onClick={() => setAddKind("calendar")}
                className={`flex-1 cursor-pointer rounded-[8px] border-none px-3 py-2 font-ui text-xs font-bold transition-colors duration-200 ${addKind === "calendar" ? "bg-navy text-white" : "bg-bg text-text-mid hover:bg-bg-dark"}`}
              >
                Rendez-vous
              </button>
              <button
                onClick={() => setAddKind("task")}
                className={`flex-1 cursor-pointer rounded-[8px] border-none px-3 py-2 font-ui text-xs font-bold transition-colors duration-200 ${addKind === "task" ? "bg-navy text-white" : "bg-bg text-text-mid hover:bg-bg-dark"}`}
              >
                Tâche
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Titre"
                aria-label="Titre"
                className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] font-ui text-sm text-text outline-none focus:border-navy"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  aria-label="Date"
                  className="flex-1 rounded-[10px] border border-border bg-bg px-[13px] py-[11px] text-sm text-text outline-none focus:border-navy"
                />
                {addKind === "calendar" && (
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    aria-label="Heure"
                    className="flex-1 rounded-[10px] border border-border bg-bg px-[13px] py-[11px] text-sm text-text outline-none focus:border-navy"
                  />
                )}
              </div>
              {saveError && <InlineError message={saveError} />}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAdd(false);
                    resetAddForm();
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleCreate} disabled={saving || !titleInput.trim()} className="flex-[2]">
                  {saving ? "Ajout..." : "Ajouter"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {loadError && <InlineError message={loadError} onRetry={load} />}
      </div>

      {loading && calendarItems.length === 0 && tasks.length === 0 ? (
        <AgendaWeekSkeleton />
      ) : isEmpty ? (
        <EmptyState icon="📅" title="Aucun rendez-vous cette semaine" description="Ajoute un événement ou demande à Claré." ctaLabel="Ajouter un événement" onCtaClick={() => setShowAdd(true)} />
      ) : (
        <div className="px-6 py-2 lg:mx-auto lg:max-w-[1240px]">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            {/* Left Column: Rendez-vous */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  📅 Rendez-vous ({calendarItems.length})
                </h3>
              </div>
              {calendarItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center">
                  <p className="text-xs font-semibold text-meta">Aucun rendez-vous prévu cette semaine</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {calendarItems.map((item) => {
                    const d = new Date(item.starts_at);
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3.5 py-3 shadow-xs"
                      >
                        <div className="min-w-[56px] text-center">
                          <div className="text-[11px] font-bold text-meta">{WEEKDAY_LABELS[(d.getDay() + 6) % 7]}</div>
                          <div className="text-[13px] font-extrabold text-navy">{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <div className="w-px self-stretch bg-border" />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-[13px] font-semibold text-text">{item.title}</p>
                          {item.source !== "manual" && (
                            <p className="mt-0.5 text-[10px] font-semibold text-gold-text">via Claré</p>
                          )}
                          {overlappingIds.has(item.id) && (
                            <button
                              type="button"
                              onClick={() => handleToggleConflict(item)}
                              className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-soft px-2.5 py-1 text-label font-bold uppercase tracking-[0.06em] text-amber-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            >
                              ⚠️ Chevauchement
                            </button>
                          )}
                          {openConflictId === item.id && overlappingIds.has(item.id) && (
                            <div className="mt-1.5 rounded-[8px] bg-bg-dark p-2 text-[11px] text-text-mid">
                              {conflictLoading[item.id] ? (
                                "Claré réfléchit..."
                              ) : conflictGated[item.id] ? (
                                <span>
                                  La suggestion de Claré est réservée aux membres Premium.{" "}
                                  <Link to="/billing" className="font-bold text-gold-text hover:underline">
                                    Voir les abonnements →
                                  </Link>
                                </span>
                              ) : conflictError[item.id] ? (
                                conflictError[item.id]
                              ) : (
                                conflictText[item.id] || "Deux éléments se chevauchent ici."
                              )}
                            </div>
                          )}
                        </div>
                        {pendingDeleteId === item.id ? (
                          <div className="flex shrink-0 gap-1">
                            <button onClick={() => confirmDeleteCalendarItem(item.id)} className="cursor-pointer rounded-[6px] border-none bg-red-solid px-2 py-1 text-[11px] font-bold text-white transition-opacity duration-200 hover:opacity-85">
                              Confirmer
                            </button>
                            <button onClick={() => setPendingDeleteId(null)} className="cursor-pointer rounded-[6px] border-none bg-bg-dark px-2 py-1 text-[11px] font-bold text-text-mid transition-colors duration-200 hover:bg-border">
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPendingDeleteId(item.id)}
                            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent text-base text-text-muted transition-colors duration-200 hover:text-text-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                            aria-label={`Supprimer ${item.title}`}
                          >
                            ×
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            {/* Right Column: Tâches */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  ✓ Tâches ({tasks.length})
                </h3>
              </div>
              {tasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center">
                  <p className="text-xs font-semibold text-meta">Aucune tâche ouverte</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 rounded-[12px] border border-border bg-white px-3.5 py-3 shadow-xs"
                    >
                      <button
                        onClick={() => handleToggleTask(task)}
                        disabled={togglingTaskIds.has(task.id)}
                        aria-label={task.status === "done" ? "Marquer comme non fait" : "Marquer comme fait"}
                        className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-none text-xs transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                          task.status === "done" ? "bg-gold text-navy hover:bg-gold-700" : "bg-bg-dark hover:bg-border"
                        }`}
                      >
                        {task.status === "done" ? "✓" : ""}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`m-0 text-[13px] font-semibold ${task.status === "done" ? "text-meta line-through" : "text-text"}`}>{task.title}</p>
                        {task.due_date && <p className="mt-0.5 text-[11px] text-meta">{task.due_date}</p>}
                      </div>
                      {pendingDeleteId === task.id ? (
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => confirmDeleteTask(task.id)} className="cursor-pointer rounded-[6px] border-none bg-red-solid px-2 py-1 text-[11px] font-bold text-white transition-opacity duration-200 hover:opacity-85">
                            Confirmer
                          </button>
                          <button onClick={() => setPendingDeleteId(null)} className="cursor-pointer rounded-[6px] border-none bg-bg-dark px-2 py-1 text-[11px] font-bold text-text-mid transition-colors duration-200 hover:bg-border">
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setPendingDeleteId(task.id)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent text-base text-text-muted transition-colors duration-200 hover:text-text-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label={`Supprimer ${task.title}`}>
                          ×
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
