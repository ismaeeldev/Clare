import { useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  Sparkles,
  Lightbulb,
  Folder,
  Trash2,
  Clock,
  Briefcase,
  Home,
  Send,
  SlidersHorizontal
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { addIdea, deleteIdea, type IdeaRow } from "@/lib/ideasRepo";
import { useEntitlement } from "@/hooks/useEntitlement";
import type { IdeeFiltre } from "./types";

const FILTRES: { val: IdeeFiltre; label: string; icon: string }[] = [
  { val: "toutes", label: "Toutes", icon: "✨" },
  { val: "pro", label: "Pro", icon: "💼" },
  { val: "perso", label: "Perso", icon: "🏠" },
];

const QUICK_IDEA_PROMPTS = [
  { label: "🚀 Nouveau projet", text: "Lancer un projet : " },
  { label: "💡 Amélioration", text: "Idée d'amélioration pour : " },
  { label: "📝 Tâche rapide", text: "Penser à faire : " },
  { label: "🎯 Objectif perso", text: "Objectif perso à tester : " },
];

function IdeeCard({ i, onRemove, removing }: { i: IdeaRow; onRemove: (id: string) => void; removing: boolean }) {
  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-border/80 bg-white p-4 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_16px_rgba(26,31,60,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="mb-2.5 text-sm text-navy font-medium leading-relaxed select-text break-words">
            {i.text}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                i.category === "pro"
                  ? "bg-navy/10 text-navy"
                  : "bg-amber-soft text-amber-text"
              }`}
            >
              {i.category === "pro" ? <Briefcase className="h-3 w-3" /> : <Home className="h-3 w-3" />}
              {i.category === "pro" ? "Pro" : "Perso"}
            </span>

            {i.linked_project && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-text border border-gold/20 max-w-full break-words">
                <Folder className="h-3 w-3 shrink-0 text-gold" />
                {i.linked_project}
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-meta">
              <Clock className="h-3 w-3" />
              {new Date(i.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>

            {i.source === "brain_dump" && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-purple-soft px-2 py-0.5 text-[10px] font-bold text-purple-text">
                <Sparkles className="h-2.5 w-2.5" />
                via vide-tête
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(i.id)}
          disabled={removing}
          aria-label="Supprimer cette idée"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted transition-all hover:bg-red-soft hover:text-red active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="Supprimer l'idée"
        >
          {removing ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-meta border-t-transparent" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>
    </Card>
  );
}

/**
 * IdeesScreen — Unified Ideas & Projects screen
 */
export function IdeesScreen({
  userId,
  ideas,
  loading,
  refreshing = false,
  loadError,
  onRetryLoad,
  onReload,
  onRefresh,
}: {
  userId: string;
  ideas: IdeaRow[];
  loading: boolean;
  refreshing?: boolean;
  loadError?: string;
  onRetryLoad?: () => void;
  onReload?: () => void;
  onRefresh: (updated: IdeaRow[]) => void;
}) {
  const { entitled: aiEntitled } = useEntitlement();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [filtre, setFiltre] = useState<IdeeFiltre>("toutes");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const addIdee = async () => {
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      // Classification is a best-effort enhancement, not required for the
      // idea to be captured — a non-entitled user skips the call entirely
      // (it would just 402) and gets the same graceful default any failed
      // classification already falls back to.
      const classification = !aiEntitled
        ? { categorie: "perso" as const, projet: null, titre_court: input.slice(0, 40) }
        : await callEdgeFunction<{ categorie: unknown; projet: unknown; titre_court: unknown }>(
            "idees-classify",
            { texte: input },
            20000
          ).catch(() => ({ categorie: "perso" as const, projet: null, titre_court: input.slice(0, 40) }));

      const categorie = classification.categorie === "pro" ? "pro" : "perso";
      const projet = typeof classification.projet === "string" ? classification.projet : null;

      const created = await addIdea(userId, input, categorie, projet);
      onRefresh([created, ...ideas]);
      setInput("");
    } catch {
      setSubmitError("La capture a échoué — réessaie.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeIdee = async (id: string) => {
    if (removingIds.has(id)) return;
    setRemovingIds((prev) => new Set(prev).add(id));
    const removed = ideas.find((i) => i.id === id);
    onRefresh(ideas.filter((i) => i.id !== id));
    try {
      await deleteIdea(id);
    } catch {
      if (removed) onRefresh([...ideas.filter((i) => i.id !== id), removed].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const filtered = ideas.filter((i) => filtre === "toutes" || i.category === filtre);

  const parProjet: Record<string, IdeaRow[]> = {};
  const sansProjet: IdeaRow[] = [];
  filtered.forEach((i) => {
    if (i.linked_project) {
      if (!parProjet[i.linked_project]) parProjet[i.linked_project] = [];
      parProjet[i.linked_project].push(i);
    } else {
      sansProjet.push(i);
    }
  });

  const countPro = ideas.filter((i) => i.category === "pro").length;
  const countPerso = ideas.filter((i) => i.category === "perso").length;
  const uniqueProjectsCount = new Set(ideas.map((i) => i.linked_project).filter(Boolean)).size;

  const handlePromptClick = (promptText: string) => {
    if (!input.trim()) {
      setInput(promptText);
    } else {
      setInput((prev) => `${prev.trim()} ${promptText}`);
    }
  };

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                Créativité & Projets
              </span>
              {refreshing && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Idées & Projets
            </h1>
          </div>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              disabled={loading || refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              aria-label="Actualiser les idées"
              title="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column (Quick Capture Input & Overview) */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 self-start flex flex-col gap-4">
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_12px_rgba(26,31,60,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="idee-input" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
                  <Lightbulb className="h-4 w-4 text-gold" />
                  Capture Rapide
                </label>
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold-text">
                  <Sparkles className="h-3 w-3" /> Auto-classement IA
                </span>
              </div>

              {/* Inspiration Chips */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                {QUICK_IDEA_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePromptClick(p.text)}
                    className="rounded-lg border border-border/70 bg-slate-50/80 px-2 py-1 text-[11px] font-medium text-navy transition-all hover:border-gold hover:bg-gold/10 hover:text-gold-text active:scale-95 cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <textarea
                  id="idee-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (!submitting) addIdee();
                    }
                  }}
                  placeholder="Une idée qui te passe par la tête (perso ou pro), un projet à démarrer..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-border/90 bg-slate-50/70 p-3.5 text-sm text-navy placeholder:text-meta/60 outline-none focus:border-navy focus:bg-white focus:ring-2 focus:ring-navy/5 transition-all"
                />
              </div>

              <div className="mt-1 flex items-center justify-between text-[11px] text-meta">
                <span>Ctrl + Entrée pour envoyer</span>
                <span>{input.length} car.</span>
              </div>

              <button
                type="button"
                onClick={addIdee}
                disabled={submitting || !input.trim()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-navy py-3 text-sm font-bold text-white shadow-raised transition-all hover:bg-navy-800 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Claré classe ton idée...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Capturer cette idée</span>
                  </>
                )}
              </button>

              {submitError && <InlineError message={submitError} onRetry={addIdee} className="mt-3" />}
            </Card>

            {/* Stats Overview */}
            {ideas.length > 0 && (
              <Card className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-meta mb-3 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-navy" />
                  Répartition des idées
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border/70 bg-slate-50/60 p-2.5 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy/10 text-navy">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-meta">Total</p>
                      <p className="font-extrabold text-navy text-sm">{ideas.length}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-slate-50/60 p-2.5 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold-text">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-meta">Projets</p>
                      <p className="font-extrabold text-gold-text text-sm">{uniqueProjectsCount}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-slate-50/60 p-2.5 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy/10 text-navy">
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-meta">Pro</p>
                      <p className="font-extrabold text-navy text-sm">{countPro}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-slate-50/60 p-2.5 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber-text">
                      <Home className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-meta">Perso</p>
                      <p className="font-extrabold text-amber-text text-sm">{countPerso}</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column (Filters & Categorized Ideas) */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            {loading && ideas.length === 0 ? (
              <div className="flex flex-col gap-3" role="status" aria-label="Chargement des idées">
                <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
                  <Skeleton width="100%" height={36} radius="lg" />
                </div>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-sm">
                    <Skeleton width="75%" height={18} className="mb-3" />
                    <div className="flex gap-2">
                      <Skeleton width="60px" height={20} radius="md" />
                      <Skeleton width="80px" height={20} radius="md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {ideas.length > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 gap-1.5 rounded-xl bg-slate-100/90 p-1">
                      {FILTRES.map(({ val, label, icon }) => {
                        const active = filtre === val;
                        const count = val === "toutes" ? ideas.length : val === "pro" ? countPro : countPerso;
                        return (
                          <button
                            key={val}
                            onClick={() => setFiltre(val)}
                            className={`relative flex items-center justify-center gap-1.5 flex-1 cursor-pointer rounded-lg border-none px-3 py-1.5 font-ui text-xs font-bold transition-all duration-200 ${
                              active ? "text-navy shadow-xs" : "text-meta hover:text-navy"
                            }`}
                          >
                            {active && (
                              <motion.div
                                layoutId="idees-filtre-indicator"
                                className="absolute inset-0 rounded-lg bg-white shadow-xs"
                                transition={{ type: "spring", stiffness: 450, damping: 35 }}
                              />
                            )}
                            <span className="relative z-10">{icon}</span>
                            <span className="relative z-10">{label}</span>
                            <span className={`relative z-10 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${active ? "bg-navy/10 text-navy" : "bg-white/60 text-meta"}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {ideas.length === 0 && loadError && (
                  <InlineError message={loadError} onRetry={onRetryLoad} />
                )}

                {ideas.length === 0 && !loadError && (
                  <EmptyState
                    icon="💡"
                    title="Aucune idée pour l'instant"
                    description="Note tout ce qui te passe par la tête, Claré range automatiquement par projet."
                  />
                )}

                {ideas.length > 0 && filtered.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-white/70 p-8 text-center">
                    <p className="text-sm font-semibold text-navy">Aucune idée trouvée dans la catégorie "{filtre}".</p>
                    <button
                      type="button"
                      onClick={() => setFiltre("toutes")}
                      className="mt-2 text-xs font-bold text-gold-text hover:underline cursor-pointer"
                    >
                      Voir toutes les idées ({ideas.length})
                    </button>
                  </div>
                )}

                {/* Grouped by Projects */}
                {Object.entries(parProjet).map(([projet, items]) => (
                  <div key={projet} className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-white/80 px-3.5 py-2 backdrop-blur-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gold/10 text-gold-text">
                          <Folder className="h-3.5 w-3.5" />
                        </div>
                        <h3 className="text-xs font-bold text-navy">
                          {projet}
                        </h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-meta">
                        {items.length} {items.length > 1 ? "idées" : "idée"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {items.map((i) => (
                        <IdeeCard key={i.id} i={i} onRemove={removeIdee} removing={removingIds.has(i.id)} />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Ideas without linked project */}
                {sansProjet.length > 0 && (
                  <div className="flex flex-col gap-2.5 mt-1">
                    {Object.keys(parProjet).length > 0 && (
                      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-white/80 px-3.5 py-2 backdrop-blur-xs">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-meta">
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <h3 className="text-xs font-bold text-navy">
                            Autres idées
                          </h3>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-meta">
                          {sansProjet.length} {sansProjet.length > 1 ? "idées" : "idée"}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-2.5">
                      {sansProjet.map((i) => (
                        <IdeeCard key={i.id} i={i} onRemove={removeIdee} removing={removingIds.has(i.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

