import type {
  BuildSystemPromptFinances,
  BuildSystemPromptJournalEntry,
  BuildSystemPromptProfile,
} from "@/lib/buildSystemPrompt";
import { dateKey } from "@/lib/dateUtils";

/**
 * calculerCoherence — extracted verbatim from App.jsx lines 284-326. Computes
 * the "coherence score" (finances/sport/projets/équilibre vs stated goals)
 * used by Stats' hero card and the AI weekly-bilan prompt. Ported as-is;
 * Step 3 only changes where profile/journal/finances/focusLog come from, not
 * this calculation.
 */
export interface CoherenceFocusLogEntry {
  date: string;
  projet?: string;
  duree?: number;
}

export interface CoherenceJournalEntry extends BuildSystemPromptJournalEntry {
  projet?: string;
}

export interface CoherenceFinances extends BuildSystemPromptFinances {
  joursEcoules?: number;
  joursDansMois?: number;
}

export interface CoherenceAxis {
  nom: string;
  score: number;
  detail: string;
  icon: string;
}

export interface CoherenceResult {
  global: number;
  axes: CoherenceAxis[];
}

export function calculerCoherence(
  profile: BuildSystemPromptProfile | undefined,
  journal: CoherenceJournalEntry[],
  finances: CoherenceFinances | undefined,
  focusLog: CoherenceFocusLogEntry[] = []
): CoherenceResult {
  // journal arrives newest-first (fetchEntries orders entry_date desc), so
  // the most recent 7 days are the first 7 elements, not the last 7 — using
  // slice(-7) here silently scored the OLDEST 7 entries in the fetched
  // batch instead (invisible with <=7 total entries, wrong for any user
  // with more journal history than that).
  const last7 = journal.slice(0, 7);
  const sportCount = last7.filter((j) => j.sport === "oui").length;
  const avgEnergie = last7.length ? last7.reduce((s, j) => s + (j.energie || 3), 0) / last7.length : 3;
  const avgHumeur = last7.length ? last7.reduce((s, j) => s + (j.humeur || 3), 0) / last7.length : 3;

  const objectifCA = parseFloat(String(profile?.objectifCA)) || 0;
  const objectifSportJours = (profile?.sport || "").split(",").map((s) => s.trim()).filter(Boolean).length;

  let scoreFinance = 50;
  if (objectifCA > 0 && finances?.joursEcoules && finances?.joursDansMois) {
    const rythmeAttendu = (objectifCA / finances.joursDansMois) * finances.joursEcoules;
    scoreFinance = rythmeAttendu > 0 ? Math.min(100, Math.round(((finances?.revenus || 0) / rythmeAttendu) * 100)) : 50;
  }

  let scoreSport = 50;
  if (objectifSportJours > 0) {
    scoreSport = Math.min(100, Math.round((sportCount / objectifSportJours) * 100));
  }

  const trenteJoursAgo = new Date();
  trenteJoursAgo.setDate(trenteJoursAgo.getDate() - 30);
  // j.date/f.date are bare YYYY-MM-DD local calendar-date strings — compare
  // as dateKey strings, not `new Date(j.date) >= trenteJoursAgo`, which
  // parses the bare string as UTC midnight and silently shifts the cutoff
  // by a day in any timezone east of UTC.
  const trenteJoursAgoKey = dateKey(trenteJoursAgo);
  const projetsActifs30j = new Set<string>();
  journal.forEach((j) => {
    if (j.projet && j.date >= trenteJoursAgoKey) projetsActifs30j.add(j.projet);
  });
  focusLog.forEach((f) => {
    if (f.projet && f.date >= trenteJoursAgoKey) projetsActifs30j.add(f.projet);
  });
  const projetsTouches7j = new Set(last7.filter((j) => j.projet).map((j) => j.projet as string));
  const scoreProjets =
    projetsActifs30j.size > 0
      ? Math.round((projetsTouches7j.size / projetsActifs30j.size) * 100)
      : projetsTouches7j.size > 0
        ? 100
        : 50;

  const scoreEquilibre = Math.round(((avgEnergie + avgHumeur) / 2 / 5) * 100);

  const scoreGlobal = Math.round((scoreFinance + scoreSport + scoreProjets + scoreEquilibre) / 4);

  return {
    global: scoreGlobal,
    axes: [
      { nom: "Finances", score: scoreFinance, detail: objectifCA > 0 ? `${finances?.revenus || 0}€ vs rythme attendu` : "Pas d'objectif CA défini", icon: "💰" },
      { nom: "Sport", score: scoreSport, detail: objectifSportJours > 0 ? `${sportCount}/${objectifSportJours} séances visées` : "Pas d'objectif sport défini", icon: "🏃" },
      { nom: "Projets", score: scoreProjets, detail: `${projetsTouches7j.size}/${projetsActifs30j.size || "?"} projets actifs touchés cette semaine`, icon: "📁" },
      { nom: "Équilibre", score: scoreEquilibre, detail: `Énergie ${avgEnergie.toFixed(1)}/5 · Humeur ${avgHumeur.toFixed(1)}/5`, icon: "⚖️" },
    ],
  };
}
