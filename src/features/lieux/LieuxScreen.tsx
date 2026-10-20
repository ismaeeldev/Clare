import { useEffect, useRef, useState } from "react";
import { RefreshCw, MapPin, Sparkles } from "lucide-react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { loadLocal, saveLocal } from "@/lib/localStoragePlaceholder";
import { fetchLieux, saveLieux } from "@/lib/profileRepo";
import { ApiTimeoutError } from "@/lib/apiClient";
import type { Lieu, LieuCategorie, LieuForm, LieuxScreenProps } from "./types";

function LieuxSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Chargement de tes lieux">
      <Skeleton height={50} radius="lg" />
      <Skeleton width={120} height={16} className="mt-2 mb-1" />
      <Skeleton height={70} radius="lg" />
      <Skeleton height={70} radius="lg" />
    </div>
  );
}

// colorVar is the raw brand color — correct for a filled pill background
// (line ~108 below). colorVarText is the darkened "-text" variant for the
// same color used as small TEXT on the plain page background (the section
// heading below) — raw gold/amber/green/purple all fail 4.5:1 there,
// found during a modernization pass (same fix pattern as StatsScreen's
// COLOR_VARS/COLOR_VARS_TEXT split).
const CATEGORIES_LIEUX: { val: LieuCategorie; label: string; colorVar: string; colorVarText: string }[] = [
  { val: "domicile", label: "🏠 Domicile", colorVar: "var(--color-navy)", colorVarText: "var(--color-navy)" },
  { val: "travail", label: "💼 Travail", colorVar: "var(--color-gold)", colorVarText: "var(--color-gold-text)" },
  { val: "famille", label: "👨‍👩‍👧 Famille", colorVar: "var(--color-amber)", colorVarText: "var(--color-amber-text)" },
  { val: "service", label: "🛠️ Services", colorVar: "var(--color-green)", colorVarText: "var(--color-green-text)" },
  { val: "business", label: "🤝 Business/clients", colorVar: "var(--color-purple)", colorVarText: "var(--color-purple-text)" },
];

const EMPTY_FORM: LieuForm = { nom: "", ville: "", categorie: "service", notes: "" };

/**
 * LieuxScreen — extracted from App.jsx's MesLieux component
 * (lines 3559-3680). Add-a-place form grouped by category, persisted via
 * Supabase profiles.preferences (with fallback to local storage).
 */
export function LieuxScreen({ userId, onLieuxUpdated }: LieuxScreenProps) {
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<LieuForm>(EMPTY_FORM);
  const [error, setError] = useState("");

  const set = <K extends keyof LieuForm>(k: K, v: LieuForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Guards a fast userId change (sign-out/sign-in as a different user
  // without a full page reload) from applying a slower, now-stale
  // response for the PREVIOUS user after a newer load has already
  // started — same pattern AgendaScreen/ChatScreen already use.
  const loadRequestRef = useRef(0);

  const loadLieux = async (isManual = false) => {
    const requestId = ++loadRequestRef.current;
    if (isManual || loaded) {
      setRefreshing(true);
    }
    if (userId) {
      try {
        const l = await fetchLieux(userId);
        if (loadRequestRef.current !== requestId) return;
        setLieux(l || []);
      } catch {
        const fallback = await loadLocal<Lieu[]>("clare_lieux");
        if (loadRequestRef.current !== requestId) return;
        setLieux(fallback || []);
      }
    } else {
      const l = await loadLocal<Lieu[]>("clare_lieux");
      if (loadRequestRef.current !== requestId) return;
      setLieux(l || []);
    }
    if (loadRequestRef.current !== requestId) return;
    setLoaded(true);
    setRefreshing(false);
  };

  useEffect(() => {
    (async () => {
      await loadLieux();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addLieu = async () => {
    if (!form.nom.trim() || !form.ville.trim() || saving) return;
    setSaving(true);
    setError("");
    const previous = lieux;
    try {
      const newLieu: Lieu = { id: Date.now(), ...form };
      const updated = [...lieux, newLieu];
      setLieux(updated);
      if (userId) {
        await saveLieux(userId, updated);
      } else {
        await saveLocal("clare_lieux", updated);
      }
      onLieuxUpdated?.(updated);
      setForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (err) {
      setLieux(previous);
      setError(err instanceof ApiTimeoutError ? "L'ajout prend trop de temps. Vérifie ta connexion et réessaie." : "L'ajout du lieu a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const removeLieu = async (id: number) => {
    if (removingIds.has(id)) return;
    setRemovingIds((prev) => new Set(prev).add(id));
    setError("");
    const previous = lieux;
    try {
      const updated = lieux.filter((l) => l.id !== id);
      setLieux(updated);
      if (userId) {
        await saveLieux(userId, updated);
      } else {
        await saveLocal("clare_lieux", updated);
      }
      onLieuxUpdated?.(updated);
    } catch (err) {
      setLieux(previous);
      setError(err instanceof ApiTimeoutError ? "La suppression prend trop de temps. Vérifie ta connexion et réessaie." : "La suppression du lieu a échoué.");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const parCategorie: Partial<Record<LieuCategorie, Lieu[]>> = {};
  lieux.forEach((l) => {
    if (!parCategorie[l.categorie]) parCategorie[l.categorie] = [];
    parCategorie[l.categorie]?.push(l);
  });

  const categoriesUsed = Object.values(parCategorie).filter((v) => v?.length).length;

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                Fiche de Vie & Déplacements
              </span>
              {refreshing && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Mes Lieux Récurrents
            </h1>
          </div>
          <button
            type="button"
            onClick={() => loadLieux(true)}
            disabled={!loaded || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
            aria-label="Actualiser les lieux"
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5 lg:mx-auto lg:max-w-[1240px]">
        <AlertBox
          text="Renseigne tes lieux récurrents une fois — Claré s'en souviendra pour t'aider à organiser tes trajets et regrouper tes RDV intelligemment."
          type="info"
        />

        {error && <InlineError message={error} />}

        {loaded && lieux.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatTile icon={<MapPin size={16} />} value={lieux.length} label="Lieux enregistrés" valueColor="navy" />
            <StatTile icon="🏠" value={parCategorie.domicile?.length || 0} label="Domicile" valueColor="purple" />
            <StatTile icon="💼" value={parCategorie.travail?.length || 0} label="Travail" valueColor="gold" />
            <StatTile icon={<Sparkles size={16} />} value={categoriesUsed} label="Catégories actives" valueColor="green" />
          </div>
        )}

        {!loaded ? (
          <LieuxSkeleton />
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-start">
            {/* Left Column: Add form / existing lieux */}
            <div className="flex flex-col gap-3.5 lg:col-span-7">
              {!showAdd ? (
                <Button variant="primary" size="lg" onClick={() => setShowAdd(true)} className="w-full">
                  + Ajouter un lieu
                </Button>
              ) : (
                <Card style={{ border: "1.5px solid var(--color-gold)" }}>
                  <div className="flex flex-col gap-2.5">
                    <input
                      value={form.nom}
                      onChange={(e) => set("nom", e.target.value)}
                      placeholder="Nom du lieu (ex : Coiffeur Jean, École des enfants...)"
                      aria-label="Nom du lieu"
                      className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] font-ui text-sm text-text outline-none focus:border-navy"
                    />
                    <input
                      value={form.ville}
                      onChange={(e) => set("ville", e.target.value)}
                      placeholder="Ville / quartier (ex : Rennes centre, Saint-Malo...)"
                      aria-label="Ville"
                      className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] font-ui text-sm text-text outline-none focus:border-navy"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES_LIEUX.map((c) => (
                        <button
                          key={c.val}
                          onClick={() => set("categorie", c.val)}
                          className="cursor-pointer rounded-[8px] border-none px-3 py-[7px] font-ui text-xs font-bold transition-opacity duration-200 hover:opacity-80"
                          style={{ background: form.categorie === c.val ? c.colorVar : "var(--color-bg)", color: form.categorie === c.val ? "var(--color-white)" : "var(--color-text-mid)" }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="Notes (optionnel) — ex : ouvert le samedi, proche du RDV X..."
                      aria-label="Notes"
                      className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] font-ui text-sm text-text outline-none focus:border-navy"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setShowAdd(false);
                          setForm(EMPTY_FORM);
                        }}
                        className="flex-1"
                      >
                        Annuler
                      </Button>
                      <Button variant="primary" onClick={addLieu} disabled={!form.nom.trim() || !form.ville.trim() || saving} className="flex-[2]">
                        {saving ? "Enregistrement..." : "Enregistrer"}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {lieux.length === 0 && !showAdd ? (
                <EmptyState icon="📍" title="Aucun lieu enregistré" description="Ajoute tes lieux récurrents pour aider Claré à organiser tes trajets." />
              ) : (
                <div className="flex flex-col gap-4">
                  {CATEGORIES_LIEUX.map((cat) => {
                    const items = parCategorie[cat.val];
                    if (!items?.length) return null;
                    return (
                      <div key={cat.val} className="flex flex-col gap-2.5">
                        <h3 className="text-xs font-bold uppercase" style={{ color: cat.colorVarText, letterSpacing: "0.07em" }}>
                          {cat.label} ({items.length})
                        </h3>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          {items.map((l) => (
                            <Card key={l.id} className="p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="mb-0.5 break-words text-[14px] font-bold text-navy">{l.nom}</p>
                                  <p className="m-0 break-words text-xs text-meta font-medium">{l.ville}</p>
                                  {l.notes && <p className="mt-1 break-words text-xs italic text-text-mid">{l.notes}</p>}
                                </div>
                                <button
                                  onClick={() => removeLieu(l.id)}
                                  disabled={removingIds.has(l.id)}
                                  aria-label={`Supprimer ${l.nom}`}
                                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border/60 bg-bg text-sm text-text-muted transition-colors duration-200 hover:bg-red-soft hover:text-red-text disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  ×
                                </button>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Why it matters */}
            <div className="flex flex-col gap-3.5 lg:col-span-5 lg:sticky lg:top-24">
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-navy">
                  <Sparkles size={15} className="text-gold" />
                  Pourquoi renseigner tes lieux ?
                </h3>
                <ul className="flex flex-col gap-2.5 text-[13px] text-text-mid">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-gold">•</span>
                    <span>Claré regroupe tes rendez-vous proches pour t'éviter des allers-retours inutiles.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-gold">•</span>
                    <span>Tes lieux habituels sont suggérés automatiquement quand tu planifies un nouveau rendez-vous.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-gold">•</span>
                    <span>Plus Claré connaît tes trajets, plus ses rappels et son organisation sont pertinents.</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-5">
                <h3 className="mb-2 text-[13px] font-bold text-navy">Catégories disponibles</h3>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES_LIEUX.map((c) => (
                    <span
                      key={c.val}
                      className="rounded-[8px] px-3 py-[7px] font-ui text-xs font-bold"
                      style={{ background: "var(--color-bg)", color: c.colorVarText }}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
