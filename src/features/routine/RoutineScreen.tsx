import { useEffect, useState } from "react";
import { RefreshCw, ListChecks } from "lucide-react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { ApiTimeoutError } from "@/lib/apiClient";
import type { BuildSystemPromptRoutine } from "@/lib/buildSystemPrompt";
import { loadLocal, saveLocal } from "@/lib/localStoragePlaceholder";
import { fetchRoutine, saveRoutine } from "@/lib/profileRepo";
import type { RoutineScreenProps, RoutineSectionKey } from "./types";

function RoutineSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Chargement de ta routine">
      <Skeleton height={50} radius="lg" />
      <Skeleton width={140} height={18} className="mt-2" />
      <div className="flex flex-col gap-1.5">
        <Skeleton height={46} radius="lg" />
        <Skeleton height={46} radius="lg" />
        <Skeleton height={46} radius="lg" />
      </div>
      <Skeleton width={140} height={18} className="mt-2" />
      <div className="flex flex-col gap-1.5">
        <Skeleton height={46} radius="lg" />
        <Skeleton height={46} radius="lg" />
      </div>
    </div>
  );
}

const ROUTINE_MENAGERE: Record<RoutineSectionKey, string[]> = {
  quotidien: ["Faire le lit", "Laver la vaisselle", "Cuisine rangée", "Poubelle si pleine"],
  hebdo: ["Laver le linge", "Changer les draps", "Passer l'aspirateur", "Nettoyer salle de bain", "Vérifier frigo"],
  mensuel: ["Nettoyer le four", "Ranger placards", "Vérifier stocks produits", "Se débarrasser de l'inutile"],
};

const SECTIONS: { key: RoutineSectionKey; label: string; icon: string; desc: string }[] = [
  { key: "quotidien", label: "Quotidien", icon: "☀️", desc: "Chaque jour, Claré les glisse dans tes petites tâches" },
  { key: "hebdo", label: "Hebdomadaire", icon: "📅", desc: "Claré les place intelligemment dans ton planning de semaine" },
  { key: "mensuel", label: "Mensuel", icon: "📆", desc: "Claré te les rappelle dans le brief du premier dimanche du mois" },
];

const EMPTY_ROUTINE: Required<BuildSystemPromptRoutine> = { quotidien: [], hebdo: [], mensuel: [] };

/**
 * RoutineScreen — extracted from App.jsx's MaRoutine component
 * (lines 3481-3557). Toggleable checklist across 3 frequency sections,
 * persisted via Supabase profiles.preferences (with fallback to local storage).
 */
export function RoutineScreen({ userId, onRoutineUpdated }: RoutineScreenProps) {
  const [routine, setRoutine] = useState<Required<BuildSystemPromptRoutine>>(EMPTY_ROUTINE);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const loadRoutine = async (isManual = false) => {
    if (isManual || loaded) {
      setRefreshing(true);
    }
    if (userId) {
      try {
        const r = await fetchRoutine(userId);
        setRoutine(r || EMPTY_ROUTINE);
      } catch {
        const fallback = await loadLocal<Required<BuildSystemPromptRoutine>>("clare_routine");
        setRoutine(fallback || EMPTY_ROUTINE);
      }
    } else {
      const r = await loadLocal<Required<BuildSystemPromptRoutine>>("clare_routine");
      setRoutine(r || EMPTY_ROUTINE);
    }
    setLoaded(true);
    setRefreshing(false);
  };

  useEffect(() => {
    (async () => {
      await loadRoutine();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggle = async (type: RoutineSectionKey, tache: string) => {
    const key = `${type}:${tache}`;
    if (togglingKeys.has(key)) return;
    setTogglingKeys((prev) => new Set(prev).add(key));
    setError("");
    const previous = routine;
    try {
      const current = routine[type] || [];
      const updated = current.includes(tache) ? current.filter((t) => t !== tache) : [...current, tache];
      const newRoutine = { ...routine, [type]: updated };
      setRoutine(newRoutine);
      if (userId) {
        await saveRoutine(userId, newRoutine);
      } else {
        await saveLocal("clare_routine", newRoutine);
      }
      onRoutineUpdated?.(newRoutine);
    } catch (err) {
      setRoutine(previous);
      setError(
        err instanceof ApiTimeoutError
          ? "La mise à jour prend trop de temps. Vérifie ta connexion et réessaie."
          : "La mise à jour de la routine a échoué."
      );
    } finally {
      setTogglingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const totalActive = (routine.quotidien?.length || 0) + (routine.hebdo?.length || 0) + (routine.mensuel?.length || 0);
  const totalAvailable = ROUTINE_MENAGERE.quotidien.length + ROUTINE_MENAGERE.hebdo.length + ROUTINE_MENAGERE.mensuel.length;

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                Habitudes & Organisation
              </span>
              {refreshing && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Routine & Habitudes
            </h1>
          </div>
          <button
            type="button"
            onClick={() => loadRoutine(true)}
            disabled={!loaded || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
            aria-label="Actualiser la routine"
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5 lg:mx-auto lg:max-w-[1240px]">
        <AlertBox
          text="Coche les tâches ménagères qui font partie de ta vie. Claré les absorbe dans ton planning — elles ne seront plus jamais oubliées ni une charge mentale."
          type="info"
        />

        {error && <AlertBox text={error} type="warning" />}

        {loaded && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatTile icon={<ListChecks size={16} />} value={`${totalActive}/${totalAvailable}`} label="Absorbées" valueColor="navy" />
            <StatTile icon="☀️" value={(routine.quotidien?.length || 0)} label="Quotidien" valueColor="gold" />
            <StatTile icon="📅" value={(routine.hebdo?.length || 0)} label="Hebdomadaire" valueColor="purple" />
            <StatTile icon="📆" value={(routine.mensuel?.length || 0)} label="Mensuel" valueColor="green" />
          </div>
        )}

        {!loaded ? (
          <RoutineSkeleton />
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
            {SECTIONS.map(({ key, label, icon, desc }) => (
              <div key={key}>
                <div className="mb-2">
                  <h3 className="mb-0.5 text-[13px] font-bold text-navy">
                    {icon} {label}
                  </h3>
                  <p className="m-0 text-[11px] text-meta">{desc}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {ROUTINE_MENAGERE[key].map((tache) => {
                    const active = (routine[key] || []).includes(tache);
                    return (
                      <button
                        key={tache}
                        onClick={() => toggle(key, tache)}
                        disabled={togglingKeys.has(`${key}:${tache}`)}
                        className={`flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3.5 py-[11px] text-left font-ui transition-colors duration-200 active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${active ? "bg-navy hover:bg-navy-800" : "bg-white hover:bg-bg-dark"}`}
                        style={{ border: `1.5px solid ${active ? "var(--color-navy)" : "var(--color-border)"}` }}
                      >
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-xs"
                          style={{ background: active ? "var(--color-gold)" : "var(--color-bg-dark)" }}
                        >
                          {active ? "✓" : ""}
                        </div>
                        <span className={`text-[13px] font-semibold ${active ? "text-white" : "text-text"}`}>{tache}</span>
                        {active && <span className="ml-auto text-[10px] font-bold text-gold">ACTIF</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalActive > 0 && <AlertBox text={`✅ ${totalActive} tâches absorbées par Claré — tu n'as plus à y penser.`} type="success" />}
      </div>
    </div>
  );
}
