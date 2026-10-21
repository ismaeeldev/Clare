import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineError } from "@/components/ui/InlineError";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { calculerCoherence } from "@/lib/calculerCoherence";
import { dateKey } from "@/lib/dateUtils";
import { useEntitlement } from "@/hooks/useEntitlement";
import type { StatsBilan, StatsScreenProps } from "./types";

/**
 * StatsSkeleton — shaped to match the real loaded layout (navy coherence
 * card, 4-tile stat grid, finances table) rather than a generic placeholder
 * — 04_ApplicationFlow.md §3's "shapes must match" rule. Found missing
 * during a Step 1-8 UI-polish re-pass: StatsRoute's own loading state was
 * two unstyled gray bars with no navy header, a jarring layout jump once
 * real data arrived.
 */
function StatsSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6 font-ui" role="status" aria-label="Chargement des statistiques">
      <div className="flex flex-col gap-6">
        {/* Top Hero Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7 rounded-2xl border border-navy/20 bg-gradient-to-br from-navy to-navy-800 p-5 text-white shadow-raised">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Skeleton width={130} height={12} variant="navy" className="mb-2" />
                <Skeleton width={180} height={14} variant="navy" />
              </div>
              <Skeleton width={56} height={56} variant="navy" radius="xl" />
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-1 flex justify-between">
                    <Skeleton width={90} height={12} variant="navy" />
                    <Skeleton width={40} height={12} variant="navy" />
                  </div>
                  <Skeleton width="100%" height={6} variant="navy" radius="full" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
              <Skeleton width={120} height={14} className="mb-3" />
              <Skeleton width="100%" height={60} radius="lg" />
            </div>
            <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
              <Skeleton width={140} height={14} className="mb-3" />
              <Skeleton width="100%" height={60} radius="lg" />
            </div>
          </div>
        </div>

        {/* 4-in-a-row metrics skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-sm">
              <Skeleton width={28} height={28} radius="lg" className="mb-2" />
              <Skeleton width="60%" height={22} radius="md" className="mb-2" />
              <Skeleton width="100%" height={5} radius="full" className="mb-2" />
              <Skeleton width="80%" height={11} />
            </div>
          ))}
        </div>

        <Skeleton width="100%" height={48} radius="xl" />
      </div>
    </div>
  );
}

const COLOR_VARS: Record<string, string> = {
  green: "var(--color-green)",
  gold: "var(--color-gold)",
  purple: "var(--color-purple)",
  red: "var(--color-red)",
};

// AA-passing variants for the same colors used as small/near-large TEXT on
// a white Card background (the raw COLOR_VARS above fail 4.5:1 as text —
// found via axe-core; still correct for ProgressBar's fill, which isn't text).
const COLOR_VARS_TEXT: Record<string, string> = {
  green: "var(--color-green-text)",
  gold: "var(--color-gold-text)",
  purple: "var(--color-purple-text)",
  red: "var(--color-red-text)",
};

/**
 * StatsScreen — extracted from App.jsx's Stats component (lines 1954-2311).
 * Coherence hero card, 4-tile grid, 30-day sport progression, focus totals,
 * finances, projects, and the AI weekly-bilan JSON flow are all preserved.
 * Step 4.2 moved the bilan generation to the real stats-bilan Edge
 * Function (fetches its own context server-side) — agenda/lieux/routine
 * were only ever used to build the old client-side prompt, no longer
 * needed here.
 */
export function StatsScreen({ profile, journal, finances, weekFinances, focusLog = [], loading = false, refreshing = false, loadError, onRetryLoad, onRefresh }: StatsScreenProps) {
  const [bilan, setBilan] = useState<StatsBilan | null>(null);
  const [loadingBilan, setLoadingBilan] = useState(false);
  // Score de Cohérence (calculerCoherence, below) is a deterministic local
  // calculation, always free — only "Générer mon bilan" (an AI call) is
  // gated. entitled defaults false while loading so the free user never
  // briefly sees the real button flash before the upgrade prompt.
  const { entitled: bilanEntitled, loading: entitlementLoading } = useEntitlement();

  // journal arrives newest-first (fetchEntries orders entry_date desc):
  // the most recent 7/30 days are the FIRST n elements, not the last n.
  // slice(-7)/-30 previously grabbed the oldest entries in the fetched
  // batch instead — invisible with few total entries, silently wrong (and
  // showing stale data) once a user has more history than that.
  const last7 = journal.slice(0, 7);
  const sportCount = last7.filter((j) => j.sport === "oui").length;
  // Real finance_entries totals (weekFinances, from StatsRoute), not
  // journal_entries' separate rollup field — see StatsScreenProps'
  // weekFinances doc comment for why.
  const totalDep = weekFinances.depenses;
  const totalRev = weekFinances.revenus;
  const avgEnergie = last7.length ? (last7.reduce((s, j) => s + (j.energie || 3), 0) / last7.length).toFixed(1) : "-";
  const avgHumeur = last7.length ? (last7.reduce((s, j) => s + (j.humeur || 3), 0) / last7.length).toFixed(1) : "-";

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // f.date is a bare YYYY-MM-DD local calendar-date string — compare as
  // dateKey strings, not `new Date(f.date) >= sevenDaysAgo`, which parses
  // the bare string as UTC midnight and silently shifts the cutoff by a
  // day in any timezone east of UTC (same bug class fixed in
  // historique/home/nutrition/prep-dimanche).
  const sevenDaysAgoKey = dateKey(sevenDaysAgo);
  const focusRecents = focusLog.filter((f) => f.date >= sevenDaysAgoKey);
  const totalFocusMin = focusRecents.reduce((s, f) => s + (f.duree || 0), 0);
  const focusParProjet: Record<string, number> = {};
  focusRecents.forEach((f) => {
    if (f.projet) focusParProjet[f.projet] = (focusParProjet[f.projet] || 0) + (f.duree || 0);
  });

  const projetsMap: Record<string, number> = {};
  last7.forEach((j) => {
    if (j.projet) projetsMap[j.projet] = (projetsMap[j.projet] || 0) + 1;
  });
  const projets = Object.entries(projetsMap).sort((a, b) => b[1] - a[1]);

  const coherence = calculerCoherence(profile, journal, finances, focusLog);

  const genBilan = async () => {
    setLoadingBilan(true);
    try {
      const parsed = await callEdgeFunction<StatsBilan>(
        "stats-bilan",
        {
          coherence,
          stats: {
            sportCount,
            avgEnergie,
            avgHumeur,
            totalDep,
            totalRev,
            totalFocusMin,
            focusSessionsCount: focusRecents.length,
            projets,
          },
        },
        40000
      );
      setBilan(parsed);
    } catch {
      // Never show the raw error message — could be a Supabase/Edge
      // Function internal string, not something meaningful to the user.
      setBilan({ erreur: "Le bilan a échoué. Réessaie." });
    }
    setLoadingBilan(false);
  };

  // journal is newest-first; the most recent 30 days are the first 30
  // elements (same ordering issue as last7 above).
  const last30 = journal.slice(0, 30);
  const seances = last30.filter((j) => j.sport === "oui" || j.sport === "léger");
  let sportProgressionBlock = null;
  if (seances.length > 0) {
    const semaines: Record<string, { count: number; label: string }> = {};
    // Iterate oldest-to-newest so insertion order (and thus `sems.slice(-4)`
    // below, which assumes the last entries are the most recent weeks)
    // is actually chronological.
    [...seances].reverse().forEach((j) => {
      const d = new Date(j.date);
      const sem = `S${Math.ceil(d.getDate() / 7)}`;
      if (!semaines[sem]) semaines[sem] = { count: 0, label: sem };
      semaines[sem].count++;
    });
    const sems = Object.values(semaines).slice(-4);
    const maxSem = Math.max(...sems.map((s) => s.count), 1);

    const semCourante = last7.filter((j) => j.sport === "oui").length;
    const semPrecedente = journal.slice(7, 14).filter((j) => j.sport === "oui").length;
    const tendance = semCourante > semPrecedente ? "↗️ En hausse" : semCourante < semPrecedente ? "↘️ En baisse" : "→ Stable";
    const couleurTendance = semCourante > semPrecedente ? "var(--color-green-text)" : semCourante < semPrecedente ? "var(--color-red-text)" : "var(--color-amber-text)";

    const sportParJour: Record<string, string> = {};
    seances.forEach((j) => {
      if (j.sport) sportParJour[j.date] = j.sport;
    });

    sportProgressionBlock = (
      <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="m-0 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            🏃 Progression sport — 30 jours
          </h3>
          <span className="text-xs font-bold" style={{ color: couleurTendance }}>
            {tendance}
          </span>
        </div>

        <div className="mb-3 flex h-[60px] items-end gap-2">
          {sems.map((s, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-11 w-full items-end overflow-hidden rounded-[6px] bg-border">
                <div
                  className="w-full rounded-[4px]"
                  style={{
                    height: `${(s.count / maxSem) * 100}%`,
                    background: i === sems.length - 1 ? "var(--color-green)" : "var(--color-gold)",
                    transition: "height 0.5s ease",
                    minHeight: s.count > 0 ? 4 : 0,
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-meta">{s.count}x</span>
              <span className="text-[10px] text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="mb-2.5 grid grid-cols-10 gap-[3px]">
          {Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            // dateKey(), not toISOString().split("T")[0] — the latter
            // converts to UTC first and silently shifts the local calendar
            // date backward by one day east of UTC.
            const key = dateKey(d);
            const val = sportParJour[key];
            return (
              <div
                key={i}
                className="relative w-full rounded-[3px]"
                style={{ paddingBottom: "100%", background: val === "oui" ? "var(--color-green)" : val === "léger" ? "var(--color-gold)" : "var(--color-border)" }}
              />
            );
          })}
        </div>
        <div className="flex gap-3 text-[11px] text-meta">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-green" /> Séance complète
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-gold" /> Légère
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-border" /> Repos
          </span>
        </div>

        <div className="mt-3 flex justify-between rounded-[10px] bg-green-soft px-3 py-2.5">
          <span className="text-xs text-text-mid">Total 30 jours</span>
          <span className="text-[13px] font-extrabold text-green-text">
            {seances.length} séance{seances.length > 1 ? "s" : ""}
          </span>
        </div>
      </Card>
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
                Performance & Analytics
              </span>
              {refreshing && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Bilan & Métriques
            </h1>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              aria-label="Actualiser les statistiques"
              title="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
            </button>
          )}
        </div>
      </div>

      {loading && journal.length === 0 ? (
        <StatsSkeleton />
      ) : (
      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-6">
          {loadError && (
            <InlineError message={`Impossible de charger tes statistiques : ${loadError}`} onRetry={onRetryLoad} />
          )}

          {/* 1. Hero Summary (Score de Cohérence + Highlights) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
            {/* Left: Score de Cohérence */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <Card className="h-full rounded-2xl border-none p-5.5 shadow-raised" style={{ background: "linear-gradient(135deg, var(--color-navy), var(--navy-700))" }}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-bold text-gold uppercase tracking-widest">
                      SCORE DE COHÉRENCE
                    </p>
                    <p className="m-0 text-xs text-white/70">Tes actions quotidiennes vs tes objectifs réels</p>
                  </div>
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white shadow-sm shrink-0"
                    style={{ background: coherence.global >= 70 ? "var(--color-green-solid)" : coherence.global >= 40 ? "var(--color-amber-solid)" : "var(--color-red-solid)" }}
                  >
                    {coherence.global}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {coherence.axes.map((a) => (
                    <div key={a.nom}>
                      <div className="mb-1 flex justify-between">
                        <span className="text-xs font-semibold text-white/90">
                          {a.icon} {a.nom}
                        </span>
                        <span className="text-[11px] font-bold text-gold">{a.score}/100</span>
                      </div>
                      <div className="h-[6px] overflow-hidden rounded-full bg-white/[0.15]">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${a.score}%`, background: a.score >= 70 ? "var(--color-green)" : a.score >= 40 ? "var(--color-amber)" : "var(--color-red)" }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-white/50">{a.detail}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right: Finances & Focus / Projects Summary */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-meta">
                  💰 Finances 7 jours
                </h3>
                <div className="flex justify-between border-b border-border/60 py-2">
                  <span className="text-xs font-medium text-text-mid">Revenus</span>
                  <span className="text-sm font-extrabold text-green-text">+{totalRev.toFixed(0)}€</span>
                </div>
                <div className="flex justify-between border-b border-border/60 py-2">
                  <span className="text-xs font-medium text-text-mid">Dépenses</span>
                  <span className="text-sm font-extrabold text-red-text">-{totalDep.toFixed(0)}€</span>
                </div>
                <div className="flex justify-between pt-2.5">
                  <span className="text-xs font-bold text-navy">Net hebdomadaire</span>
                  <span className={`text-base font-extrabold ${totalRev - totalDep >= 0 ? "text-green-text" : "text-red-text"}`}>
                    {totalRev - totalDep >= 0 ? "+" : ""}
                    {(totalRev - totalDep).toFixed(0)}€
                  </span>
                </div>
              </Card>

              {/* Combined Focus & Projects Card */}
              <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="m-0 text-xs font-bold uppercase tracking-wider text-meta">
                    🎯 Focus & Projets avancés
                  </h3>
                  <span className="text-sm font-extrabold text-purple-text">
                    {Math.floor(totalFocusMin / 60)}h{String(totalFocusMin % 60).padStart(2, "0")}
                  </span>
                </div>
                <p className="mb-2.5 text-[11px] font-medium text-meta">
                  {focusRecents.length} session{focusRecents.length > 1 ? "s" : ""} de focus · {projets.length} projet{projets.length > 1 ? "s" : ""} actif{projets.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-col divide-y divide-border/60 max-h-[140px] overflow-y-auto no-scrollbar">
                  {projets.length > 0 ? (
                    projets.map(([nom, count], i) => (
                      <div key={nom} className="flex items-center justify-between py-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: ["var(--color-gold)", "var(--color-green)", "var(--color-purple)", "var(--color-amber)"][i % 4] }}
                          />
                          <span className="text-navy font-semibold truncate">{nom}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {focusParProjet[nom] !== undefined && (
                            <span className="font-bold text-purple-text">{focusParProjet[nom]}min</span>
                          )}
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-navy">
                            {count}j / 7
                          </span>
                        </div>
                      </div>
                    ))
                  ) : Object.entries(focusParProjet).length > 0 ? (
                    Object.entries(focusParProjet).map(([nom, min]) => (
                      <div key={nom} className="flex justify-between py-2 text-xs">
                        <span className="text-navy font-medium truncate pr-2">{nom}</span>
                        <span className="font-extrabold text-purple-text shrink-0">{min}min</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-meta py-2 m-0">Aucun projet ou session enregistré cette semaine.</p>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* 2. Four Key Metrics (1 Row on Desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            {[
              { icon: "🏃", label: "Sport", val: `${sportCount}/7 j`, sub: `Objectif : ${profile?.sport || "?"}`, color: "green", prog: sportCount, max: 7 },
              { icon: "⚡", label: "Énergie moy.", val: `${avgEnergie}/5`, sub: "Moyenne 7 jours", color: "gold", prog: parseFloat(avgEnergie) || 0, max: 5 },
              { icon: "😊", label: "Humeur moy.", val: `${avgHumeur}/5`, sub: "Moyenne 7 jours", color: "purple", prog: parseFloat(avgHumeur) || 0, max: 5 },
              { icon: "💶", label: "Dépenses", val: `${totalDep.toFixed(0)}€`, sub: "7 derniers jours", color: "red", prog: totalDep, max: 500 },
            ].map(({ icon, label, val, sub, color, prog, max }) => (
              <Card key={label} className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.04)] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[20px]">{icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-meta">{label}</span>
                  </div>
                  <div className="text-[22px] font-extrabold tracking-tight mt-1" style={{ color: COLOR_VARS_TEXT[color] }}>
                    {val}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5">
                    <ProgressBar value={prog} max={max} color={COLOR_VARS[color]} />
                  </div>
                  <div className="text-[11px] font-medium text-meta">{sub}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* 3. Sport Progression (Full width when available) */}
          {sportProgressionBlock && (
            <div className="w-full">
              {sportProgressionBlock}
            </div>
          )}

          {/* 4. Bilan Trigger & Balanced Results */}
          <div className="flex flex-col gap-4">
            {!entitlementLoading && !bilanEntitled ? (
              <UpgradePrompt message="Le bilan de semaine généré par Claré est réservé aux membres Premium." />
            ) : (
            <>
            <button
              onClick={genBilan}
              disabled={loadingBilan || entitlementLoading}
              className="flex w-full cursor-pointer items-center justify-between rounded-[14px] border-[1.5px] border-gold bg-gold-soft px-5 py-[15px] font-ui transition-opacity duration-200 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">📋</span>
                <span className="text-sm font-bold text-navy">{loadingBilan ? "Génération..." : "Générer mon bilan semaine complet"}</span>
              </div>
              <span className="text-base text-gold-text">◈</span>
            </button>

            {bilan && bilan.erreur && (
              <Card className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
                <p className="mb-1.5 text-[13px] font-bold text-red-text">⚠️ Le bilan a échoué</p>
                <p className="mb-2.5 text-[12px] text-text-mid">{bilan.erreur}</p>
                <Button onClick={genBilan} disabled={loadingBilan} className="w-full">
                  {loadingBilan ? "Nouvelle tentative..." : "Réessayer →"}
                </Button>
              </Card>
            )}

            {bilan && !bilan.erreur && (
              <div className="flex flex-col gap-4">
                <Card className="border-none" style={{ background: "linear-gradient(135deg, var(--color-navy), var(--navy-700))" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1 text-[10px] font-bold text-gold" style={{ letterSpacing: "0.07em" }}>
                        SYNTHÈSE DU BILAN DE SEMAINE
                      </p>
                      <p className="m-0 text-[14px] font-medium text-white leading-relaxed">
                        {bilan.resume}
                      </p>
                    </div>
                    {bilan.note && (
                      <div className="ml-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-gold text-[24px] font-black text-navy shadow-gold-glow">
                        {bilan.note}
                      </div>
                    )}
                  </div>
                </Card>

                {/* 3-Column Structured Breakdown */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {bilan.points_forts && bilan.points_forts.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-green-text">
                        ✅ Points forts
                      </h3>
                      {bilan.points_forts.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 py-1.5">
                          <span className="text-[13px] text-green-text font-bold">•</span>
                          <p className="m-0 text-xs text-navy/90 font-medium leading-relaxed">
                            {p}
                          </p>
                        </div>
                      ))}
                    </Card>
                  )}

                  {bilan.points_attention && bilan.points_attention.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-amber-text">
                        ⚠️ Points d'attention
                      </h3>
                      {bilan.points_attention.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 py-1.5">
                          <span className="text-[13px] text-amber-text font-bold">•</span>
                          <p className="m-0 text-xs text-navy/90 font-medium leading-relaxed">
                            {p}
                          </p>
                        </div>
                      ))}
                    </Card>
                  )}

                  {bilan.priorites_semaine_prochaine && bilan.priorites_semaine_prochaine.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-navy">
                        🎯 Priorités semaine prochaine
                      </h3>
                      {bilan.priorites_semaine_prochaine.map((p, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2.5 py-2 ${
                            i < (bilan.priorites_semaine_prochaine?.length ?? 0) - 1 ? "border-b border-border/60" : ""
                          }`}
                        >
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-navy text-[10px] font-extrabold text-gold">{i + 1}</div>
                          <p className="m-0 text-xs text-navy font-semibold">{p}</p>
                        </div>
                      ))}
                    </Card>
                  )}
                </div>

                {bilan.motivation && (
                  <Card className="rounded-2xl bg-gold-soft/70 border border-gold/30 p-4.5 shadow-xs">
                    <p className="m-0 text-center text-xs italic font-semibold text-navy leading-relaxed">
                      "{bilan.motivation}"
                    </p>
                  </Card>
                )}
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
