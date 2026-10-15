import { BackButton } from "@/components/ui/BackButton";
import { useState } from "react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ProfilEditForm as ProfilEditFormShape, ProfilEditScreenProps } from "./types";

const FIELDS: { key: keyof ProfilEditFormShape; label: string; placeholder: string; required?: boolean; numeric?: boolean }[] = [
  { key: "prenom", label: "Prénom", placeholder: "Ton prénom", required: true },
  { key: "secteur", label: "Secteur d'activité", placeholder: "ex : BTP, conseil, artisanat..." },
  { key: "objectifCA", label: "Objectif CA mensuel (€)", placeholder: "ex : 5000", numeric: true },
  { key: "revenuActuel", label: "CA mensuel actuel (€)", placeholder: "ex : 3500", numeric: true },
  { key: "sport", label: "Jours de sport prévus", placeholder: "ex : lundi, jeudi, samedi" },
  { key: "budget", label: "Budget courses / semaine (€)", placeholder: "ex : 150", numeric: true },
  { key: "alimentation", label: "Régime alimentaire", placeholder: "ex : halal, standard, végé..." },
  { key: "personnes", label: "Personnes à nourrir", placeholder: "1", numeric: true },
  { key: "aliments_eviter", label: "Allergies / aliments à éviter", placeholder: "ex : fruits de mer, lactose..." },
  { key: "caloriesCible", label: "Objectif calorique / jour", placeholder: "ex : 2200 kcal", numeric: true },
];

const SITUATION_OPTIONS = [
  { val: "seul", label: "Seul(e)" },
  { val: "couple", label: "En couple" },
  { val: "couple-enfants", label: "En couple, enfant(s)" },
  { val: "seul-enfants", label: "Seul(e), enfant(s)" },
];

const MODE_OPTIONS = [
  { val: "terrain", label: "🚗 Terrain — RDV, déplacements" },
  { val: "bureau", label: "🏠 Sédentaire — bureau/domicile" },
  { val: "mix", label: "🔄 Mix des deux" },
];

const CHARGE_OPTIONS = [
  { val: "admin", label: "📋 L'administratif" },
  { val: "prospection", label: "📞 Trouver des clients" },
  { val: "solitude", label: "🧍 La solitude" },
  { val: "organisation", label: "🗓️ Manque de structure" },
  { val: "argent", label: "💶 L'incertitude financière" },
];

const EQUIPEMENTS_OPTIONS = ["Airfryer", "Four", "Plaques", "Micro-ondes", "Thermomix", "Plancha", "Multicuiseur", "Barbecue"];

const TEMPS_OPTIONS = [
  { val: "rapide", label: "⚡ Rapide (20min max)" },
  { val: "normal", label: "🍳 Normal (45min)" },
  { val: "jai-le-temps", label: "👨‍🍳 J'ai le temps" },
];

const OBJECTIF_NUTRITION_OPTIONS = [
  { val: "perte", label: "📉 Perte" },
  { val: "maintien", label: "⚖️ Maintien" },
  { val: "prise", label: "📈 Prise" },
];

/**
 * ProfilEditSkeleton — shaped to match the real layout (navy header + a
 * stack of labeled field placeholders) rather than a generic centered dot.
 * Found missing during a Step 1-8 UI-polish re-pass.
 */
function ProfilEditSkeleton() {
  return (
    <div className="pb-24 lg:pb-8 font-ui" role="status" aria-label="Chargement du profil">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <Skeleton width={36} height={36} radius="md" />
          <div>
            <Skeleton width={110} height={20} className="mb-1.5" />
            <Skeleton width={170} height={11} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-5 lg:mx-auto lg:max-w-[1240px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Skeleton width={120} height={11} className="mb-1.5" />
            <Skeleton width="100%" height={44} radius="lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ProfilEditScreen — thin loading gate. ProfilEditForm's useState(profile)
 * initializers must capture the real fetched profile on first mount, not a
 * placeholder default — so the form only mounts once `loading` is false,
 * same fix pattern as SettingsScreen's split (found during the same Step
 * 1-8 UI-polish pass: naively rendering the form immediately with a
 * `loading` flag would have silently frozen every field at its default
 * value forever, since a useState initializer only runs once per mount).
 */
export function ProfilEditScreen({ profile, onSave, onBack, loading = false }: ProfilEditScreenProps) {
  if (loading) {
    return <ProfilEditSkeleton />;
  }
  return <ProfilEditForm profile={profile} onSave={onSave} onBack={onBack} />;
}

/**
 * ProfilEditForm — extracted from App.jsx's ProfilEdit component
 * (lines 2816-3030). Free-text fields + several single-select pill/button
 * groups + multi-select equipment chips, all preserved verbatim.
 *
 * The original screen also embeds a `<Sauvegarde />` export/import-backup
 * widget — deliberately omitted here (not one of Batch 6's 3 target
 * screens, and depends on exporterDonnees/importerDonnees which aren't yet
 * ported); deferred to a later batch / Step 7.6 Settings work per an
 * explicit scope decision during Batch 6.
 */
function ProfilEditForm({ profile, onSave, onBack }: Omit<ProfilEditScreenProps, "loading">) {
  const [form, setForm] = useState<ProfilEditFormShape>({
    prenom: profile?.prenom || "",
    secteur: profile?.secteur || "",
    situationFamiliale: profile?.situationFamiliale || "",
    modeTravail: profile?.modeTravail || "terrain",
    chargeMentale: profile?.chargeMentale || "",
    sport: profile?.sport || "",
    budget: String(profile?.budget || ""),
    alimentation: profile?.alimentation || "",
    personnes: String(profile?.personnes || "1"),
    objectifCA: String(profile?.objectifCA || ""),
    revenuActuel: String(profile?.revenuActuel || ""),
    tempsCuisine: profile?.tempsCuisine || "normal",
    aliments_eviter: profile?.aliments_eviter || "",
    caloriesCible: String(profile?.caloriesCible || ""),
    objectifNutrition: profile?.objectifNutrition || "maintien",
  });
  const [equipements, setEquipements] = useState<string[]>(profile?.equipements ? profile.equipements.split(", ").filter(Boolean) : []);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const set = <K extends keyof ProfilEditFormShape>(k: K, v: ProfilEditFormShape[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleEquip = (e: string) => setEquipements((eq) => (eq.includes(e) ? eq.filter((x) => x !== e) : [...eq, e]));

  const handleSave = async () => {
    const fullProfile = { ...form, equipements: equipements.join(", ") };
    setSaving(true);
    setSaveError("");
    try {
      await onSave(fullProfile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("La sauvegarde a échoué. Réessaie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
              Compte & Personnalisation
            </span>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Mon Profil
            </h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-6 py-5 lg:mx-auto lg:max-w-[1240px]">
        {saved && <AlertBox text="Profil mis à jour ✅" type="success" />}

        {FIELDS.map(({ key, label, placeholder, required, numeric }) => (
          <div key={key}>
            <label htmlFor={`profil-field-${key}`} className="mb-1.5 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
              {label} {required && <span className="text-gold-text">*</span>}
            </label>
            <input
              id={`profil-field-${key}`}
              type={numeric ? "number" : "text"}
              inputMode={numeric ? "decimal" : undefined}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              className="box-border w-full rounded-[12px] bg-white px-[14px] py-3 font-ui text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
              style={{ border: `1.5px solid ${form[key] ? "var(--color-navy)" : "var(--color-border)"}` }}
            />
          </div>
        ))}

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Ta situation
          </label>
          <div className="flex flex-wrap gap-2">
            {SITUATION_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => set("situationFamiliale", val)}
                disabled={saving}
                className={`cursor-pointer rounded-[10px] border-none px-3.5 py-[9px] font-ui text-[13px] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.situationFamiliale === val ? "bg-navy text-white" : "bg-white text-text-mid hover:bg-bg-dark"
                }`}
                style={form.situationFamiliale === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Ton mode de travail
          </label>
          <div className="flex flex-col gap-2">
            {MODE_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => set("modeTravail", val)}
                disabled={saving}
                className={`cursor-pointer rounded-[12px] border-none px-4 py-3 text-left font-ui text-sm font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.modeTravail === val ? "bg-navy text-white" : "bg-white text-text hover:bg-bg-dark"
                }`}
                style={form.modeTravail === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Ce qui te pèse le plus
          </label>
          <div className="flex flex-col gap-2">
            {CHARGE_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => set("chargeMentale", val)}
                disabled={saving}
                className={`cursor-pointer rounded-[12px] border-none px-4 py-3 text-left font-ui text-sm font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.chargeMentale === val ? "bg-navy text-white" : "bg-white text-text hover:bg-bg-dark"
                }`}
                style={form.chargeMentale === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Équipements cuisine
          </label>
          <div className="flex flex-wrap gap-2">
            {EQUIPEMENTS_OPTIONS.map((eq) => (
              <button
                key={eq}
                onClick={() => toggleEquip(eq)}
                disabled={saving}
                className={`cursor-pointer rounded-full border-none px-3.5 py-2 font-ui text-[13px] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  equipements.includes(eq) ? "bg-navy text-white" : "bg-white text-text-mid hover:bg-bg-dark"
                }`}
                style={equipements.includes(eq) ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {eq}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Temps dispo pour cuisiner
          </label>
          <div className="flex flex-col gap-2">
            {TEMPS_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => set("tempsCuisine", val)}
                disabled={saving}
                className={`cursor-pointer rounded-[12px] border-none px-4 py-3 text-left font-ui text-sm font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.tempsCuisine === val ? "bg-navy text-white" : "bg-white text-text hover:bg-bg-dark"
                }`}
                style={form.tempsCuisine === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
            Objectif nutritionnel
          </label>
          <div className="flex gap-2">
            {OBJECTIF_NUTRITION_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => set("objectifNutrition", val)}
                disabled={saving}
                className={`flex-1 cursor-pointer rounded-[10px] border-none px-1.5 py-[10px] text-center font-ui text-xs font-bold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.objectifNutrition === val ? "bg-navy text-white" : "bg-white text-text-mid hover:bg-bg-dark"
                }`}
                style={form.objectifNutrition === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {saveError && <InlineError message={saveError} onRetry={handleSave} />}

        <Button variant="primary" size="lg" onClick={handleSave} disabled={!form.prenom.trim() || saving} className="mt-2 w-full">
          {saving ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </div>
  );
}
