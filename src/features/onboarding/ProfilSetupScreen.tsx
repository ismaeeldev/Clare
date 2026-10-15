import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ArrowLeft,
  Check,
  User,
  Briefcase,
  Activity,
  Utensils,
  Apple,
  Rocket
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { ApiTimeoutError } from "@/lib/apiClient";
import { completeOnboarding, loadProfile, saveOnboardingStep } from "@/lib/profileRepo";
import { Chip } from "./Chip";
import { FieldLabel } from "./FieldLabel";
import { DEFAULT_PROFIL_FORM, type ProfilForm } from "./types";

const STEP_ICONS = [User, Briefcase, Activity, Utensils, Apple, Rocket];
const stepQuestions = ["Identité", "Vie Pro", "Sport", "Cuisine", "Nutrition", "Confirmation"];
const stepHeadings = [
  "Faisons connaissance",
  "Ta vie professionnelle",
  "Ton activité sportive",
  "Ta cuisine & budget",
  "Tes habitudes alimentaires",
  "Ton profil est prêt ✨",
];
const TOTAL_STEPS = 6;

const SITUATIONS = [
  { val: "seul", label: "Seul(e)" },
  { val: "couple", label: "En couple" },
  { val: "couple-enfants", label: "En couple + enfant(s)" },
  { val: "seul-enfants", label: "Seul(e) + enfant(s)" },
];
const MODES_TRAVAIL = [
  { val: "terrain", label: "🚗 Terrain — RDV, déplacements fréquents" },
  { val: "bureau", label: "🏠 Sédentaire — bureau ou domicile" },
  { val: "mix", label: "🔄 Mix des deux — hybride" },
];
const CHARGES_MENTALES = [
  { val: "admin", label: "📋 L'administratif & paperasse" },
  { val: "prospection", label: "📞 Trouver des clients & vendre" },
  { val: "solitude", label: "🧍 La solitude de l'indépendant" },
  { val: "organisation", label: "🗓️ Le manque de structure" },
  { val: "argent", label: "💶 L'incertitude financière" },
];
const OBJECTIFS_SPORT = [
  { val: "regulier", label: "📅 Reprendre une régularité" },
  { val: "perf", label: "🏆 Progresser & performer" },
  { val: "sante", label: "💚 Garder la forme & santé" },
  { val: "poids", label: "⚖️ Perdre du poids" },
];
const EQUIPEMENTS_LIST = ["Airfryer", "Four", "Plaques", "Micro-ondes", "Thermomix", "Plancha", "Multicuiseur", "Barbecue"];
const TEMPS_CUISINE = [
  { val: "rapide", label: "⚡ Rapide — 20 min max" },
  { val: "normal", label: "🍳 Normal — 30 à 45 min" },
  { val: "jai-le-temps", label: "👨‍🍳 J'ai le temps — 1h+" },
];
const REGIMES = ["Standard", "Halal", "Végétarien", "Végétalien", "Sans gluten", "Keto", "Méditerranéen"];
const OBJECTIFS_NUTRITION = [
  { val: "perte", label: "📉 Perte de poids" },
  { val: "maintien", label: "⚖️ Maintien" },
  { val: "prise", label: "📈 Prise de muscle" },
];

export function ProfilSetupScreen({ onDone }: { onDone: (profile: ProfilForm & { equipements: string }) => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfilForm>(DEFAULT_PROFIL_FORM);
  const [equipements, setEquipements] = useState<string[]>([]);
  const [resuming, setResuming] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const saved = await loadProfile(user.id);
        if (saved && !saved.onboardingComplete) {
          setForm((f) => ({ ...f, ...saved.form }));
          setEquipements(saved.equipements);
          setStep(Math.min(saved.step, TOTAL_STEPS - 1));
        }
      } catch {
        // Fallback
      } finally {
        setResuming(false);
      }
    })();
  }, [user]);

  const set = <K extends keyof ProfilForm>(k: K, v: ProfilForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const toggleEquip = (e: string) =>
    setEquipements((eq) => (eq.includes(e) ? eq.filter((x) => x !== e) : [...eq, e]));

  const canNext = () => {
    if (step === 0) return form.prenom.trim().length > 0;
    if (step === 1) return form.secteur.trim().length > 0;
    return true;
  };

  const handleNext = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveOnboardingStep(user.id, step, form, equipements);
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof ApiTimeoutError ? "La sauvegarde prend trop de temps. Vérifie ta connexion et réessaie." : "La sauvegarde a échoué. Réessaie.");
      return;
    }

    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      setSaving(false);
      return;
    }

    try {
      await completeOnboarding(user.id);
    } catch {
      setSaving(false);
      setSaveError("La finalisation a échoué. Réessaie.");
      return;
    }
    setSaving(false);
    onDone({ ...form, equipements: equipements.join(", ") });
  };

  const StepIcon = STEP_ICONS[step] || Sparkles;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="flex flex-col gap-5">
            <Input
              label="Comment tu t'appelles ?"
              placeholder="Ton prénom"
              value={form.prenom}
              onChange={(e) => set("prenom", e.target.value)}
              autoFocus
            />
            <div>
              <FieldLabel>Ta situation personnelle</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {SITUATIONS.map((o) => (
                  <Chip
                    key={o.val}
                    val={o.val}
                    label={o.label}
                    active={form.situationFamiliale === o.val}
                    onClick={(v) => set("situationFamiliale", v)}
                    full
                  />
                ))}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="flex flex-col gap-5">
            <Input
              label="Ton secteur d'activité"
              placeholder="BTP, conseil, artisanat, commerce..."
              value={form.secteur}
              onChange={(e) => set("secteur", e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Objectif CA mensuel"
                placeholder="ex : 5000 €"
                type="number"
                value={form.objectifCA}
                onChange={(e) => set("objectifCA", e.target.value)}
              />
              <Input
                label="CA actuel estimé"
                placeholder="ex : 3500 €"
                type="number"
                value={form.revenuActuel}
                onChange={(e) => set("revenuActuel", e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Mode de travail principal</FieldLabel>
              <div className="flex flex-col gap-2">
                {MODES_TRAVAIL.map((o) => (
                  <Chip
                    key={o.val}
                    val={o.val}
                    label={o.label}
                    active={form.modeTravail === o.val}
                    onClick={(v) => set("modeTravail", v)}
                    full
                  />
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Ce qui te pèse le plus au quotidien</FieldLabel>
              <div className="flex flex-col gap-2">
                {CHARGES_MENTALES.map((o) => (
                  <Chip
                    key={o.val}
                    val={o.val}
                    label={o.label}
                    active={form.chargeMentale === o.val}
                    onClick={(v) => set("chargeMentale", v)}
                    full
                  />
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-5">
            <Input
              label="Jours de sport prévus"
              placeholder="ex : lundi, jeudi, samedi"
              hint="Claré intégrera ces séances dans ton planning et adaptera ta nutrition."
              value={form.sport}
              onChange={(e) => set("sport", e.target.value)}
              autoFocus
            />
            <div>
              <FieldLabel>Objectif sportif</FieldLabel>
              <div className="flex flex-col gap-2">
                {OBJECTIFS_SPORT.map((o) => (
                  <Chip
                    key={o.val}
                    val={o.val}
                    label={o.label}
                    active={form.objectifSport === o.val}
                    onClick={(v) => set("objectifSport", v)}
                    full
                  />
                ))}
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel>Équipements cuisine à disposition</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {EQUIPEMENTS_LIST.map((eq) => {
                  const active = equipements.includes(eq);
                  return (
                    <button
                      key={eq}
                      type="button"
                      onClick={() => toggleEquip(eq)}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-navy text-white shadow-xs"
                          : "border border-border/80 bg-slate-50 text-navy hover:bg-slate-100"
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-gold" />}
                      {eq}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <FieldLabel>Temps disponible pour cuisiner</FieldLabel>
              <div className="flex flex-col gap-2">
                {TEMPS_CUISINE.map((o) => (
                  <Chip
                    key={o.val}
                    val={o.val}
                    label={o.label}
                    active={form.tempsCuisine === o.val}
                    onClick={(v) => set("tempsCuisine", v)}
                    full
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Budget courses / sem (€)"
                placeholder="ex : 80"
                type="number"
                value={form.budget}
                onChange={(e) => set("budget", e.target.value)}
                autoFocus
              />
              <Input
                label="Personnes à nourrir"
                placeholder="1"
                type="number"
                value={form.personnes}
                onChange={(e) => set("personnes", e.target.value)}
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col gap-5">
            <div>
              <FieldLabel>Régime alimentaire</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {REGIMES.map((r) => {
                  const active = form.alimentation === r.toLowerCase();
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set("alimentation", r.toLowerCase())}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-navy text-white shadow-xs"
                          : "border border-border/80 bg-slate-50 text-navy hover:bg-slate-100"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
            <Input
              label="Allergies / aliments à éviter"
              placeholder="ex : fruits de mer, lactose, arachides..."
              value={form.aliments_eviter}
              onChange={(e) => set("aliments_eviter", e.target.value)}
              autoFocus
            />
            <div>
              <FieldLabel>Objectif nutritionnel</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {OBJECTIFS_NUTRITION.map((o) => {
                  const active = form.objectifNutrition === o.val;
                  return (
                    <button
                      key={o.val}
                      type="button"
                      onClick={() => set("objectifNutrition", o.val)}
                      className={`rounded-xl px-2 py-2.5 text-center text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-navy text-white shadow-xs"
                          : "border border-border/80 bg-slate-50 text-navy hover:bg-slate-100"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Input
              label="Objectif calorique / jour (optionnel)"
              placeholder="ex : 2200 kcal"
              hint="Laisse vide si tu ne sais pas — Claré l'estimera automatiquement."
              value={form.caloriesCible}
              onChange={(e) => set("caloriesCible", e.target.value)}
            />
          </div>
        );
      case 5:
        return (
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#13172E] to-[#1C2344] p-5.5 text-white shadow-lg border border-white/10">
              <div aria-hidden="true" className="absolute -bottom-6 -right-6 text-[120px] text-white/[0.04] pointer-events-none font-display">
                ◈
              </div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-gold">
                  ◈ Synthèse de ton Profil Claré
                </span>
                <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                  Prêt à démarrer
                </span>
              </div>
              
              <div className="flex flex-col gap-2.5 divide-y divide-white/10 text-xs">
                {[
                  { label: "Prénom", val: form.prenom },
                  { label: "Secteur d'activité", val: form.secteur },
                  { label: "Objectif CA", val: form.objectifCA ? `${form.objectifCA} € / mois` : "Non spécifié" },
                  { label: "Jours de sport", val: form.sport || "Non spécifié" },
                  { label: "Régime", val: form.alimentation || "Standard" },
                  { label: "Équipements", val: equipements.join(", ") || "Basiques" },
                  { label: "Temps cuisine", val: form.tempsCuisine || "Normal" },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between pt-2">
                    <span className="text-white/50">{label}</span>
                    <span className="font-bold text-white text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-center text-xs text-meta leading-relaxed">
              Tout est modifiable à tout moment dans tes <strong>Réglages & Profil</strong>.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  if (resuming) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6">
        <Skeleton width={220} height={26} radius="lg" />
        <Skeleton width={280} height={16} radius="md" />
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-bg-dark/30 font-ui pb-16">
      {/* Sleek Top Bar with Progress */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[540px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-navy">
              Étape {step + 1} / {TOTAL_STEPS}
            </span>
            <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-bold text-gold-text">
              {stepQuestions[step]}
            </span>
          </div>
        </div>
        
        {/* Animated Progress bar */}
        <div className="mx-auto mt-3 max-w-[540px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full bg-navy"
              initial={false}
              animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="mx-auto max-w-[540px] px-5 pt-7">
        <div className="rounded-3xl border border-border/80 bg-white p-6 sm:p-8 shadow-[0_4px_25px_rgba(26,31,60,0.04)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
              <StepIcon className="h-5 w-5 text-navy" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                Configuration personnalisée
              </span>
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-navy tracking-tight">
                {stepHeadings[step]}
              </h2>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          {saveError && (
            <div className="mt-4">
              <InlineError message={saveError} onRetry={handleNext} />
            </div>
          )}

          {!saveError && !canNext() && (
            <p className="mt-4 text-xs font-semibold text-red-600" role="status">
              {step === 0 ? "Indique ton prénom pour continuer." : "Indique ton secteur d'activité pour continuer."}
            </p>
          )}

          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <Button 
                variant="secondary" 
                size="lg" 
                onClick={() => setStep((s) => s - 1)} 
                disabled={saving} 
                aria-label="Étape précédente"
                className="px-4 cursor-pointer font-bold"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Retour
              </Button>
            )}
            <Button
              variant={canNext() ? "primary" : "secondary"}
              size="lg"
              disabled={!canNext() || saving}
              onClick={handleNext}
              className="flex-1 font-bold cursor-pointer"
            >
              {saving ? (
                "Enregistrement..."
              ) : step === TOTAL_STEPS - 1 ? (
                "🚀 Lancer mon espace Claré"
              ) : (
                "Continuer →"
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

