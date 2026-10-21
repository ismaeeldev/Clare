import { BackButton } from "@/components/ui/BackButton";
import { useState } from "react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { TypeDot } from "@/components/ui/TypeDot";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { calculerCoherence } from "@/lib/calculerCoherence";
import { todayKey, getWeekStart, dateKey } from "@/lib/dateUtils";
import { saveLocal } from "@/lib/localStoragePlaceholder";
import { acceptWeeklyPlan } from "@/lib/weeklyPlanRepo";

/**
 * PrepDimancheSkeleton — shaped to match the real intro-step layout (navy
 * gradient header, gold-soft intro card, optional agenda preview list)
 * rather than a generic placeholder. Found missing during a Step 1-8
 * UI-polish re-pass — the previous loading state was two plain gray bars
 * on white with no navy header.
 */
function PrepDimancheSkeleton() {
  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement de la préparation de semaine">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <Skeleton width={36} height={36} radius="md" />
          <div>
            <Skeleton width={200} height={18} className="mb-1.5" />
            <Skeleton width={140} height={11} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-6 lg:mx-auto lg:max-w-[1240px]">
        <Card className="bg-gold-soft" style={{ borderColor: "color-mix(in srgb, var(--color-gold) 31%, transparent)" }}>
          <Skeleton width="100%" height={14} className="mb-2" />
          <Skeleton width="80%" height={14} />
        </Card>
        <Skeleton width={180} height={11} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="px-3.5 py-[10px]">
            <div className="flex items-center gap-2.5">
              <Skeleton width={8} height={8} radius="full" />
              <Skeleton width="70%" height={13} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
import type { PrepDimancheBrief, PrepDimancheBriefEntry, PrepDimancheForm, PrepDimancheScreenProps } from "./types";

const CHARGE_OPTIONS = [
  { val: "légère", label: "😌 Légère — peu de RDV" },
  { val: "normale", label: "🙂 Normale — rythme habituel" },
  { val: "chargée", label: "😤 Chargée — beaucoup de RDV" },
  { val: "intense", label: "🔥 Intense — semaine critique" },
];

const PROGRESS_LABELS = ["Analyse ton agenda et tes priorités", "Construit ton planning 1-3-5 jour par jour", "Prépare ta liste de courses"];

/**
 * PrepDimancheScreen — extracted from App.jsx's PrepDimanche component
 * (lines 3032-3463). 4-step flow (intro/questions/génération/résultat), a
 * "projets négligés" 30-day mirror calculation, and a 2-call AI brief
 * (résumé/priorités/miroir/ne_pas_faire/finances/motivation/courses in
 * call 1, day-by-day 1-3-5 planning in call 2) all preserved verbatim.
 */
export function PrepDimancheScreen({ userId, profile, journal, agenda, finances, focusLog = [], routine = {}, onBack, onBriefSaved, loading: loadingData = false }: PrepDimancheScreenProps) {
  const [step, setStep] = useState(0); // 0 = intro, 1 = questions, 2 = génération, 3 = résultat
  const [form, setForm] = useState<PrepDimancheForm>({
    chargeSemaine: "normale",
    objectifPrincipal: "",
    contraintes: "",
    sportPrevu: profile?.sport || "",
  });
  const [brief, setBrief] = useState<PrepDimancheBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  const set = <K extends keyof PrepDimancheForm>(k: K, v: PrepDimancheForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const agendaSemaine = agenda
    .filter((e) => {
      // e.date is a bare YYYY-MM-DD local date-key (dateKey()) — comparing
      // it to `new Date()` (now, with time-of-day) by naively parsing the
      // string requires building both sides as local-midnight Dates,
      // otherwise `new Date("YYYY-MM-DD")` parses as UTC midnight and the
      // diff silently shifts by the local timezone offset.
      const [y, m, d2] = e.date.split("-").map(Number);
      const d = new Date(y, (m ?? 1) - 1, d2 ?? 1);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= -1 && diff <= 8;
    })
    .sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`));

  const calculerProjetsNegliges = () => {
    const trenteJoursAgo = new Date();
    trenteJoursAgo.setDate(trenteJoursAgo.getDate() - 30);
    const dernierContact: Record<string, string> = {};
    journal.forEach((j) => {
      if (j.projet && new Date(j.date) >= trenteJoursAgo) {
        if (!dernierContact[j.projet] || j.date > dernierContact[j.projet]) dernierContact[j.projet] = j.date;
      }
    });
    focusLog.forEach((f) => {
      if (f.projet && new Date(f.date) >= trenteJoursAgo) {
        if (!dernierContact[f.projet] || f.date > dernierContact[f.projet]) dernierContact[f.projet] = f.date;
      }
    });
    const today = todayKey();
    return Object.entries(dernierContact)
      .map(([projet, derniereDate]) => {
        const jours = Math.floor((new Date(today).getTime() - new Date(derniereDate).getTime()) / 86400000);
        return { projet, derniereDate, joursDepuis: jours };
      })
      .sort((a, b) => b.joursDepuis - a.joursDepuis);
  };
  const projetsNegliges = calculerProjetsNegliges();
  const coherence = calculerCoherence(profile, journal, finances, focusLog);

  const genBrief = async () => {
    if (loading) return;
    setStep(2);
    setLoading(true);
    setAccepted(false);
    setAcceptError("");

    try {
      const parsed = await callEdgeFunction<PrepDimancheBrief>(
        "prep-dimanche-brief",
        {
          form,
          projetsNegliges,
          coherenceGlobal: coherence.global,
          routine,
        },
        // Was 60000 — the server's own per-call Claude budget is 48s
        // (prep-dimanche-brief/index.ts's CLAUDE_TIMEOUT_MS), and a real
        // live test against production took 51.7s end-to-end, leaving
        // only ~8s margin against a 60s client timeout. Given real AI
        // latency variance, bumped to 75s so a slightly slower real
        // generation doesn't reintroduce the exact "fails because the
        // client gives up first" race this whole fix exists to close.
        75000
      );
      setBrief(parsed);
      // Legacy local slot — no longer the source of truth (HomeRoute reads
      // the real weekly_plans row via weeklyPlanRepo.fetchAcceptedPlan
      // instead, per this step's fix), kept only so any other lingering
      // reader of this key during the transition doesn't see nothing.
      const briefEntry: PrepDimancheBriefEntry = { date: todayKey(), data: parsed, type: "brief_dimanche" };
      await saveLocal("clare_dernier_brief", briefEntry);
      onBriefSaved(briefEntry);
    } catch {
      // erreur is only ever used as a boolean flag to switch the UI into
      // its error branch — its value itself is never rendered verbatim
      // (see the erreur block below), so no raw error message is stored.
      setBrief({
        resume: "La génération a échoué — réessaie.",
        priorites: [],
        jours: [],
        courses: [],
        finances: "",
        motivation: "",
        erreur: "generation_failed",
      });
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  /**
   * Explicit Accept step — 04_ApplicationFlow.md §2.9: "Accept → plan
   * versioned and persisted, becomes 'this week's accepted plan'." Never
   * happens implicitly on generation — a generated-but-not-yet-accepted
   * brief must never silently become the official plan (CLA-FR-009's
   * failure-state guarantee also depends on this: the previous accepted
   * plan must stay untouched until this explicit action).
   */
  const acceptPlan = async () => {
    if (!brief || brief.erreur) return;
    setAccepting(true);
    setAcceptError("");
    try {
      const weekStartKey = dateKey(getWeekStart());
      const { erreur: _erreur, jours, ...summary } = brief;
      void _erreur;
      await acceptWeeklyPlan(userId, weekStartKey, summary, { jours: jours ?? [] }, "claude-sonnet-4-5");
      setAccepted(true);
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "L'acceptation a échoué — réessaie.");
    } finally {
      setAccepting(false);
    }
  };

  if (loadingData) {
    return <PrepDimancheSkeleton />;
  }

  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
              Rituel du Dimanche Soir
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Préparation de Semaine
            </h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6 lg:mx-auto lg:max-w-[1240px]">
        {step === 0 && (
          <>
            <Card className="bg-gold-soft" style={{ borderColor: "color-mix(in srgb, var(--color-gold) 31%, transparent)" }}>
              <p className="m-0 text-sm text-text" style={{ lineHeight: 1.7 }}>
                Prends 3 minutes maintenant. Claré analyse ta semaine complète et te prépare tout d'un coup — repas, courses, alertes, priorités. Tu n'auras presque plus à toucher l'app jusqu'à dimanche prochain.
              </p>
            </Card>

            {agendaSemaine.length > 0 && (
              <div>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  Ton agenda déjà connu cette semaine
                </h3>
                {agendaSemaine.slice(0, 5).map((ev) => (
                  <Card key={ev.id} className="mb-1.5 px-3.5 py-[10px]">
                    <div className="flex items-center gap-2.5">
                      <TypeDot type={ev.type} />
                      <p className="m-0 flex-1 text-[13px] text-text">{ev.titre}</p>
                      <span className="text-[11px] font-bold text-meta">
                        {ev.date.slice(8)}/{ev.date.slice(5, 7)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Button variant="accent" size="lg" onClick={() => setStep(1)} className="w-full">
              Commencer ma préparation →
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <Card>
              <label className="mb-[10px] block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                Comment tu sens ta semaine à venir ?
              </label>
              <div className="flex flex-col gap-2">
                {CHARGE_OPTIONS.map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => set("chargeSemaine", val)}
                    className={`cursor-pointer rounded-[12px] border-none px-4 py-3 text-left font-ui text-sm font-semibold transition-colors duration-200 ${
                      form.chargeSemaine === val ? "bg-navy text-white" : "bg-white text-text hover:bg-bg-dark"
                    }`}
                    style={form.chargeSemaine === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <label htmlFor="prep-objectif" className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                Ton objectif principal cette semaine
              </label>
              <input
                id="prep-objectif"
                value={form.objectifPrincipal}
                onChange={(e) => set("objectifPrincipal", e.target.value)}
                placeholder="ex : finaliser la landing CourtierTravaux"
                className="box-border w-full rounded-[10px] bg-bg px-[14px] py-3 font-ui text-sm text-text"
                style={{ border: `1.5px solid ${form.objectifPrincipal ? "var(--color-navy)" : "var(--color-border)"}` }}
              />
            </Card>

            <Card>
              <label htmlFor="prep-contraintes" className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                Contraintes particulières
              </label>
              <input
                id="prep-contraintes"
                value={form.contraintes}
                onChange={(e) => set("contraintes", e.target.value)}
                placeholder="ex : déplacement mercredi, invité jeudi soir..."
                className="box-border w-full rounded-[10px] bg-bg px-[14px] py-3 font-ui text-sm text-text"
                style={{ border: `1.5px solid ${form.contraintes ? "var(--color-navy)" : "var(--color-border)"}` }}
              />
            </Card>

            <Card>
              <label htmlFor="prep-sport" className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                Sport prévu cette semaine
              </label>
              <input
                id="prep-sport"
                value={form.sportPrevu}
                onChange={(e) => set("sportPrevu", e.target.value)}
                placeholder="ex : lundi, jeudi, samedi"
                className="box-border w-full rounded-[10px] bg-bg px-[14px] py-3 font-ui text-sm text-text"
                style={{ border: `1.5px solid ${form.sportPrevu ? "var(--color-navy)" : "var(--color-border)"}` }}
              />
            </Card>

            <Button variant="accent" size="lg" onClick={genBrief} disabled={loading} className="w-full">
              Générer mon brief de semaine →
            </Button>
          </>
        )}

        {step === 2 && (
          <div className="px-5 py-[60px] text-center">
            <div className="mb-4 text-[40px]" style={{ animation: "spin 2s linear infinite" }}>◈</div>
            <p className="text-sm font-semibold text-text-mid">Claré prépare ta semaine...</p>
            <div className="mx-auto mt-5 flex max-w-[260px] flex-col gap-2 text-left">
              {PROGRESS_LABELS.map((label, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-[6px] w-[6px] shrink-0 rounded-full bg-gold" />
                  <span className="text-xs text-meta">{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] text-text-muted">2 analyses en parallèle — 20 à 40 secondes</p>
          </div>
        )}

        {step === 3 && brief && brief.erreur && (
          <>
            <Card className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
              <p className="mb-1.5 text-[13px] font-bold text-red-text">⚠️ La génération a échoué</p>
              <p className="m-0 text-xs text-text-mid" style={{ lineHeight: 1.5 }}>
                {brief.resume}
              </p>
            </Card>
            <Button variant="primary" size="lg" onClick={genBrief} disabled={loading} className="w-full">
              {loading ? "Nouvelle tentative..." : "Réessayer →"}
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)} className="w-full">
              Modifier mes réponses
            </Button>
          </>
        )}

        {step === 3 && brief && !brief.erreur && (
          <>
            <Card className="bg-green-soft" style={{ borderColor: "color-mix(in srgb, var(--color-green) 25%, transparent)" }}>
              <p className="m-0 text-[13px] font-bold text-green-text">✅ Ta semaine est prête. Tu peux relâcher la pression.</p>
              {brief.resume && (
                <p className="mt-2 text-[13px] text-text" style={{ lineHeight: 1.6 }}>
                  {brief.resume}
                </p>
              )}
            </Card>

            {brief.priorites && brief.priorites.length > 0 && (
              <Card>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  🎯 Tes 3 priorités
                </h3>
                {brief.priorites.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2.5 py-[7px] ${i < (brief.priorites?.length ?? 0) - 1 ? "border-b border-border" : ""}`}>
                    <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-gold-soft text-[11px] font-extrabold text-gold-text">{i + 1}</div>
                    <p className="m-0 text-[13px] text-text">{p}</p>
                  </div>
                ))}
              </Card>
            )}

            <Card className="border-none" style={{ background: "linear-gradient(135deg, var(--color-navy), var(--navy-700))" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-[10px] font-bold text-gold" style={{ letterSpacing: "0.07em" }}>
                    SCORE DE COHÉRENCE
                  </p>
                  <p className="m-0 text-[11px] text-white/70">{coherence.axes.map((a) => `${a.icon} ${a.score}`).join("  ·  ")}</p>
                </div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[14px] text-lg font-black text-white"
                  style={{ background: coherence.global >= 70 ? "var(--color-green-solid)" : coherence.global >= 40 ? "var(--color-amber-solid)" : "var(--color-red-solid)" }}
                >
                  {coherence.global}
                </div>
              </div>
            </Card>

            {(brief.miroir_projets || projetsNegliges.length > 0) && (
              <Card className="bg-purple-soft" style={{ borderColor: "color-mix(in srgb, var(--color-purple) 25%, transparent)" }}>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-purple-text" style={{ letterSpacing: "0.07em" }}>
                  🪞 Miroir projets
                </h3>
                {brief.miroir_projets && (
                  <p className="mb-2.5 text-[13px] text-text" style={{ lineHeight: 1.6 }}>
                    {brief.miroir_projets}
                  </p>
                )}
                {projetsNegliges.map((p) => (
                  <div key={p.projet} className="flex items-center justify-between py-1.5" style={{ borderTop: "1px solid color-mix(in srgb, var(--color-purple) 12.5%, transparent)" }}>
                    <span className="text-[13px] text-text">{p.projet}</span>
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: p.joursDepuis >= 10 ? "var(--color-red-text)" : p.joursDepuis >= 5 ? "var(--color-amber-text)" : "var(--color-green-text)" }}
                    >
                      {p.joursDepuis === 0 ? "aujourd'hui" : `il y a ${p.joursDepuis}j`}
                    </span>
                  </div>
                ))}
              </Card>
            )}

            {brief.ne_pas_faire && brief.ne_pas_faire.length > 0 && (
              <Card className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-red-text" style={{ letterSpacing: "0.07em" }}>
                  🚫 Ne pas faire cette semaine
                </h3>
                {brief.ne_pas_faire.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 py-[5px]"
                    style={i > 0 ? { borderTop: "1px solid color-mix(in srgb, var(--color-red) 12.5%, transparent)" } : undefined}
                  >
                    <span className="shrink-0 text-[13px] text-red-text">×</span>
                    <p className="m-0 text-[13px] text-text" style={{ lineHeight: 1.5 }}>
                      {t}
                    </p>
                  </div>
                ))}
              </Card>
            )}

            {brief.jours && brief.jours.length > 0 && (
              <div>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  📅 Ton planning 1-3-5
                </h3>
                {brief.jours.map((j, i) => (
                  <Card key={i} className="mb-2" style={{ borderColor: j.alerte ? "color-mix(in srgb, var(--color-amber) 31%, transparent)" : "var(--color-border)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] font-extrabold text-navy">{j.jour}</span>
                      <span className="text-[11px] text-meta">{j.date}</span>
                    </div>
                    {j.alerte && <p className="mb-2 text-xs font-semibold text-amber-text">⚠️ {j.alerte}</p>}
                    {j.conseil && (
                      <p className="mb-2.5 text-xs italic text-text-mid" style={{ lineHeight: 1.5 }}>
                        {j.conseil}
                      </p>
                    )}

                    {j.tache_1 && (
                      <div className="mb-2 rounded-[10px] bg-navy px-3 py-2.5">
                        <p className="mb-0.5 text-[10px] font-bold text-gold" style={{ letterSpacing: "0.06em" }}>
                          ① GRANDE TÂCHE
                        </p>
                        <p className="m-0 text-[13px] font-semibold text-white">{j.tache_1}</p>
                      </div>
                    )}

                    {j.taches_3 && j.taches_3.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-[5px] text-[10px] font-bold text-meta" style={{ letterSpacing: "0.06em" }}>
                          ③ TÂCHES IMPORTANTES
                        </p>
                        {j.taches_3.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-2 py-[3px]">
                            <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-gold-soft text-[10px] font-extrabold text-gold-text">{ti + 1}</div>
                            <span className="text-xs text-text">{t}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {j.taches_5 && j.taches_5.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-[5px] text-[10px] font-bold text-meta" style={{ letterSpacing: "0.06em" }}>
                          ⑤ PETITES TÂCHES
                        </p>
                        <div className="flex flex-wrap gap-[5px]">
                          {j.taches_5.map((t, ti) => (
                            <span key={ti} className="rounded-[8px] bg-bg-dark px-2 py-1 text-[11px] text-text-mid">
                              · {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 border-t border-border pt-2 text-xs">
                      <span className="text-meta">☀️ {j.repasMidi}</span>
                      <span className="text-meta">🌙 {j.repasSoir}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {brief.courses && brief.courses.length > 0 && (
              <Card>
                <h3 className="mb-2.5 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                  🛒 Liste de courses
                </h3>
                <div className="flex flex-col gap-1.5">
                  {brief.courses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-[6px] w-[6px] shrink-0 rounded-full bg-green" />
                      <span className="text-[13px] text-text">{c}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {brief.finances && <AlertBox text={brief.finances} type="info" />}

            {brief.motivation && (
              <Card className="border-none bg-navy">
                <p className="m-0 text-center text-sm italic text-gold" style={{ lineHeight: 1.7 }}>
                  "{brief.motivation}"
                </p>
              </Card>
            )}

            {accepted ? (
              <Card className="bg-green-soft" style={{ borderColor: "color-mix(in srgb, var(--color-green) 25%, transparent)" }}>
                <p className="m-0 text-[13px] font-bold text-green-text">✅ Plan accepté — c'est ton plan officiel pour cette semaine.</p>
              </Card>
            ) : (
              <>
                {acceptError && <p className="m-0 text-[12px] text-red-text">{acceptError}</p>}
                <Button variant="accent" size="lg" onClick={acceptPlan} disabled={accepting} className="w-full">
                  {accepting ? "Enregistrement..." : "✅ Accepter ce plan →"}
                </Button>
              </>
            )}

            <Button variant="secondary" onClick={() => setStep(1)} className="w-full">
              Modifier et régénérer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
