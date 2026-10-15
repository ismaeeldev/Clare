import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  Sparkles,
  ChefHat,
  Clock,
  Flame,
  Trash2,
  Search,
  Utensils,
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { UpgradePrompt } from "@/components/ui/UpgradePrompt";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { todayKey, getWeekStart, dateKey } from "@/lib/dateUtils";
import { loadLocal, saveLocal } from "@/lib/localStoragePlaceholder";
import { fetchMealPlan, fetchShoppingChecks, toggleShoppingCheck, type MealPlanRow } from "@/lib/nutritionRepo";
import { buildShoppingList, groupByAisle } from "@/lib/shoppingList";
import { useEntitlement } from "@/hooks/useEntitlement";
import { ApiTimeoutError } from "@/lib/apiClient";
import type { NutritionFavori, NutritionRecette, NutritionScreenProps, NutritionTab } from "./types";

const TABS: { id: NutritionTab; label: (favorisCount: number) => string }[] = [
  { id: "plan", label: () => "Plan semaine" },
  { id: "recette", label: () => "Une envie ?" },
  { id: "favoris", label: (n) => `Favoris (${n})` },
];

const MEAL_SLOT_LABEL: Record<MealPlanRow["meal_slot"], string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙" };
const DAY_LABELS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return DAY_LABELS_FR[d.getDay()];
}

function groupByDay(rows: MealPlanRow[]): { day: string; meals: MealPlanRow[] }[] {
  const byDay = new Map<string, MealPlanRow[]>();
  const order = { breakfast: 0, lunch: 1, dinner: 2 };
  for (const row of rows) {
    const list = byDay.get(row.day) ?? [];
    list.push(row);
    byDay.set(row.day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, meals]) => ({ day, meals: meals.sort((a, b) => order[a.meal_slot] - order[b.meal_slot]) }));
}

function NutritionSkeleton() {
  return (
    <div className="flex flex-col gap-5 font-ui" role="status" aria-label="Chargement de la nutrition">
      <div className="rounded-2xl border border-navy/20 bg-gradient-to-r from-navy to-navy-800 p-5 text-white shadow-raised">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton width={100} height={12} variant="navy" className="mb-2" />
            <Skeleton width={160} height={28} variant="navy" />
          </div>
          <Skeleton width={120} height={36} variant="navy" radius="lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-7">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <Skeleton width={120} height={16} />
                <Skeleton width={80} height={22} radius="md" />
              </div>
              <div className="flex flex-col gap-2.5">
                <Skeleton width="100%" height={36} radius="lg" />
                <Skeleton width="100%" height={36} radius="lg" />
                <Skeleton width="100%" height={36} radius="lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-sm">
            <Skeleton width={140} height={16} className="mb-3" />
            <Skeleton width="100%" height={32} radius="lg" className="mb-4" />
            <div className="flex flex-col gap-2.5">
              <Skeleton width="100%" height={28} radius="md" />
              <Skeleton width="100%" height={28} radius="md" />
              <Skeleton width="100%" height={28} radius="md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * NutritionScreen — "plan" tab rebuilt for Step 5.3 on the deterministic
 * pipeline (docs/06_AIPromptRegistry.md §2.9, CLA-FR-014): meal-plan-
 * generate produces meal_plans rows whose kcal/macros come from
 * nutrition-calc against real nutrition_foods (CIQUAL/OFF), never from
 * Claude directly. "recette"/"favoris" tabs are unchanged (single-recipe
 * generation from a craving + localStorage favorites — out of 5.3's scope,
 * still on nutrition-recette's AI-estimated numbers, a known limitation
 * flagged in nutrition-recette's own code comment).
 */
export function NutritionScreen({ userId, journal = [], profile }: NutritionScreenProps) {
  // Only "Générer mon plan" (meal-plan-generate) and "Trouver ma recette"
  // (nutrition-recette) are AI calls — both gated below. Viewing an
  // already-generated plan, checking off the shopping list, and favorites
  // are all free, read/local actions and stay fully available.
  const { entitled: aiEntitled, loading: entitlementLoading } = useEntitlement();
  const weekStart = dateKey(getWeekStart());
  const [mealPlan, setMealPlan] = useState<MealPlanRow[] | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [checks, setChecks] = useState<Map<string, boolean>>(new Map());
  // Per-item pending set — prevents a rapid double-tap on a shopping-list
  // checkbox from firing two toggleShoppingCheck calls with opposite
  // states, whose responses could resolve out of order.
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());
  const [hideChecked, setHideChecked] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Set<string>>(new Set());
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>("all");

  const toggleAisleCollapse = (aisle: string) => {
    setCollapsedAisles((prev) => {
      const next = new Set(prev);
      if (next.has(aisle)) next.delete(aisle);
      else next.add(aisle);
      return next;
    });
  };

  const [recetteEnvie, setRecetteEnvie] = useState("");
  const [recetteResult, setRecetteResult] = useState<NutritionRecette | null>(null);
  const [loadingRecette, setLoadingRecette] = useState(false);
  const [favoris, setFavoris] = useState<NutritionFavori[]>([]);
  const [savingFavori, setSavingFavori] = useState(false);
  const [expandedFavoris, setExpandedFavoris] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<NutritionTab>("plan");

  const toggleFavoriExpand = (id: number) => {
    setExpandedFavoris((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const CRAVING_SUGGESTIONS = [
    { label: "⚡ Rapide (<20 min)", text: "Un repas express sain et prêt en moins de 20 minutes" },
    { label: "🥗 Salade fraîcheur", text: "Une salade fraîche, croquante et équilibrée" },
    { label: "🍗 Poulet & herbes", text: "Poulet rôti tendre aux herbes avec légumes de saison" },
    { label: "🍳 Airfryer croustillant", text: "Une idée croustillante et légère à l'airfryer" },
    { label: "🥑 Végétarien gourmand", text: "Un plat végétarien riche en protéines et saveurs" },
    { label: "🥞 Brunch & pancakes", text: "Des pancakes healthy ou une idée de brunch équilibré" },
  ];

  useEffect(() => {
    (async () => {
      const f = await loadLocal<NutritionFavori[]>("clare_favoris");
      setFavoris(f || []);
    })();
  }, []);

  const loadPlan = async (isManual = false) => {
    if (!userId) return;
    if (isManual || mealPlan) {
      setRefreshingPlan(true);
    } else {
      setLoadingPlan(true);
    }
    try {
      const [plan, checksMap] = await Promise.all([fetchMealPlan(userId, weekStart), fetchShoppingChecks(userId, weekStart)]);
      setMealPlan(plan);
      setChecks(checksMap);
    } catch {
      if (!mealPlan) setMealPlan([]);
    } finally {
      setLoadingPlan(false);
      setRefreshingPlan(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await loadPlan();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, weekStart]);

  const genPlan = async () => {
    // Defense in depth, matching meal-plan-generate's own server-side
    // entitlement.ts check (CLA-FR-021: a UI-only gate alone is
    // insufficient) — this just avoids a free user waiting out a 90s
    // generation call only to get a 402 at the end.
    if (!userId || !aiEntitled) return;
    setGenerating(true);
    setGenerateError("");
    try {
      // 90s, not the more typical 45s used elsewhere: live testing this
      // session showed the Claude call alone taking ~35-37s, before the
      // function even starts its 15 nutrition-calc lookups + 2 DB
      // round-trips (delete + insert) — 60s was cutting the real observed
      // latency too close.
      const result = await callEdgeFunction<{ meal_plans: MealPlanRow[] }>("meal-plan-generate", {}, 90000);
      setMealPlan(result.meal_plans);
      setChecks(new Map());
    } catch (e) {
      // Never show the raw error message — it can be a Supabase/Edge
      // Function internal string, not something meaningful to the user.
      setGenerateError(e instanceof ApiTimeoutError ? "Génération trop longue — réessaie dans quelques secondes" : "La génération du plan a échoué. Réessaie.");
    }
    setGenerating(false);
  };

  const onToggleCheck = async (itemKey: string, currentlyChecked: boolean) => {
    if (!userId || togglingKeys.has(itemKey)) return;
    setTogglingKeys((prev) => new Set(prev).add(itemKey));
    const next = !currentlyChecked;
    setChecks((prev) => new Map(prev).set(itemKey, next));
    try {
      await toggleShoppingCheck(userId, weekStart, itemKey, next);
    } catch {
      // Revert on failure — the checkbox is the only signal the user has
      // that the tap registered, so silently leaving it wrong is worse
      // than reverting it visibly.
      setChecks((prev) => new Map(prev).set(itemKey, currentlyChecked));
    } finally {
      setTogglingKeys((prev) => {
        const s = new Set(prev);
        s.delete(itemKey);
        return s;
      });
    }
  };

  const genRecette = async () => {
    if (!recetteEnvie.trim() || !aiEntitled) return;
    setLoadingRecette(true);
    try {
      const parsed = await callEdgeFunction<NutritionRecette>("nutrition-recette", { envie: recetteEnvie }, 40000);
      setRecetteResult(parsed);
    } catch {
      // Same rule as genPlan's catch — never show a raw error message.
      setRecetteResult({ erreur: "La recherche de recette a échoué. Réessaie." });
    }
    setLoadingRecette(false);
  };

  const addFavori = async () => {
    if (!recetteResult || recetteResult.erreur || savingFavori) return;
    setSavingFavori(true);
    try {
      const newFav: NutritionFavori = { id: Date.now(), titre: recetteResult.nom || recetteEnvie, contenu: recetteResult, date: todayKey() };
      const updated = [newFav, ...favoris];
      setFavoris(updated);
      await saveLocal("clare_favoris", updated);
    } finally {
      setSavingFavori(false);
    }
  };

  const removeFavori = async (id: number) => {
    const updated = favoris.filter((f) => f.id !== id);
    setFavoris(updated);
    await saveLocal("clare_favoris", updated);
  };

  const lastRepas = journal
    .slice(-5)
    .filter((j) => j.repas)
    .map((j) => ({ date: j.date, repas: j.repas as string }));

  const shoppingItems = mealPlan ? buildShoppingList(mealPlan) : [];
  const shoppingByAisle = groupByAisle(shoppingItems);
  const budget = profile?.budget ? Number(profile.budget) : null;
  // No real per-item price data exists (CIQUAL/OFF don't carry prices) —
  // "budget total shown vs. stated budget" (04_ApplicationFlow.md §2.10)
  // is therefore the user's own stated weekly budget only, not a computed
  // cost total, which would require inventing prices CLA-FR-014's spirit
  // forbids doing implicitly.
  const days = mealPlan ? groupByDay(mealPlan) : [];
  const targetCalories = profile?.caloriesCible ? Number(profile.caloriesCible) : null;

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      {/* Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-green-text">
                  Santé & Alimentation
                </span>
                {refreshingPlan && (
                  <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
                )}
              </div>
              <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
                Nutrition & Repas
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadPlan(true)}
                disabled={loadingPlan || refreshingPlan || generating}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
                aria-label="Actualiser la nutrition"
                title="Actualiser"
              >
                <RefreshCw className={`h-4 w-4 ${refreshingPlan ? "animate-spin text-gold" : "text-navy"}`} />
              </button>
            </div>
          </div>

          {/* Segmented Control */}
          <div className="flex gap-1.5 rounded-xl bg-slate-100/90 p-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex-1 cursor-pointer rounded-lg border-none px-3 py-1.5 font-ui text-xs font-bold transition-all duration-200 ${
                    active ? "text-navy shadow-sm" : "text-meta hover:text-navy"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="nutrition-tab-indicator"
                      className="absolute inset-0 rounded-lg bg-white shadow-xs"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{t.label(favoris.length)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-4 sm:px-6 lg:h-[calc(100vh-130px)] lg:overflow-hidden">
        {tab === "plan" && (
          <>
            {loadingPlan && (!mealPlan || mealPlan.length === 0) ? (
              <NutritionSkeleton />
            ) : generating ? (
              <Card className="bg-gold-soft" style={{ borderColor: "color-mix(in srgb, var(--color-gold) 31%, transparent)" }}>
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="h-2 w-2 animate-[chat-dot_1s_infinite] rounded-full bg-gold" />
                  <p className="m-0 text-[13px] font-bold text-navy">Claré calcule ton plan nutritionnel...</p>
                  <p className="m-0 text-[12px] text-text-mid">Génération des repas + calcul exact des calories, ça prend quelques secondes.</p>
                </div>
              </Card>
            ) : !mealPlan || mealPlan.length === 0 ? (
              <>
                {generateError && (
                  <Card className="bg-red-soft" style={{ borderColor: "color-mix(in srgb, var(--color-red) 25%, transparent)" }}>
                    <p className="mb-1.5 text-[13px] font-bold text-red-text">⚠️ La génération a échoué</p>
                    <p className="mb-2.5 text-[12px] text-text-mid">{generateError}</p>
                    <Button variant="primary" onClick={genPlan} disabled={generating} className="w-full">
                      Réessayer →
                    </Button>
                  </Card>
                )}
                {!entitlementLoading && !aiEntitled ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <div className="text-4xl text-text-light" aria-hidden="true">🍽️</div>
                    <h2 className="font-display text-base font-extrabold text-navy">Aucun plan pour cette semaine</h2>
                    <p className="max-w-xs text-body-sm text-text-mid">La génération de plan par Claré est réservée aux membres Premium.</p>
                    <UpgradePrompt message="Débloque la génération automatique de ton plan de repas." />
                  </div>
                ) : (
                  <EmptyState
                    icon="🍽️"
                    title="Aucun plan pour cette semaine"
                    description="Claré peut générer 5 jours de repas adaptés à ton régime, ton budget et ton agenda, avec les vraies calories calculées."
                    ctaLabel="Générer mon plan →"
                    onCtaClick={genPlan}
                    ctaDisabled={generating}
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-12 lg:gap-6 lg:h-full lg:items-start">
                <div className="flex flex-col gap-3 lg:col-span-7 lg:h-full lg:overflow-y-auto lg:pr-2 overscroll-contain no-scrollbar">
                  {targetCalories && (
                    <div className="mb-1 flex items-center justify-between rounded-2xl bg-navy px-4 py-3 shadow-[0_2px_8px_rgba(26,31,60,0.06)]">
                      <div>
                        <p className="m-0 text-[10px] font-bold text-gold" style={{ letterSpacing: "0.07em" }}>
                          CIBLE / JOUR
                        </p>
                        <p className="mt-0.5 text-lg font-extrabold text-white">{targetCalories} kcal</p>
                      </div>
                      <p className="m-0 text-right text-[10px] text-white/50" style={{ lineHeight: 1.7 }}>
                        <span className="block">🌅 ~{Math.round(targetCalories * 0.25)} kcal</span>
                        <span className="block">☀️ ~{Math.round(targetCalories * 0.4)} kcal</span>
                        <span className="block">🌙 ~{Math.round(targetCalories * 0.35)} kcal</span>
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <h3 className="m-0 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                      🍽️ Ton plan de la semaine
                    </h3>
                    {aiEntitled && (
                      <button onClick={genPlan} disabled={generating} className="cursor-pointer border-none bg-transparent text-[11px] font-bold text-green-text transition-opacity duration-200 hover:opacity-70">
                        Régénérer
                      </button>
                    )}
                  </div>

                  {days.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100/80 p-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDayFilter("all")}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          selectedDayFilter === "all"
                            ? "bg-white text-navy shadow-xs font-extrabold"
                            : "text-meta hover:text-navy"
                        }`}
                      >
                        Tous ({days.length}j)
                      </button>
                      {days.map(({ day }) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelectedDayFilter(day)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            selectedDayFilter === day
                              ? "bg-white text-navy shadow-xs font-extrabold"
                              : "text-meta hover:text-navy"
                          }`}
                        >
                          {dayLabel(day)}
                        </button>
                      ))}
                    </div>
                  )}

                  {(selectedDayFilter === "all" ? days : days.filter((d) => d.day === selectedDayFilter)).map(({ day, meals }) => {
                    const dayTotal = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);
                    const hasUnresolved = meals.some((m) => m.generation_status !== "ok");
                    return (
                      <Card key={day} className="mb-2 rounded-2xl border border-border/80 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[13px] font-extrabold text-navy">{dayLabel(day)}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-[8px] bg-green-soft px-2 py-0.5 text-[11px] font-extrabold text-green-text">🔥 {Math.round(dayTotal)} kcal</span>
                            {hasUnresolved && (
                              <span
                                title="Un ou plusieurs ingrédients n'ont pas pu être identifiés — exclus du total"
                                className="h-2 w-2 rounded-full bg-amber"
                                aria-label="Ingrédient non vérifié dans ce jour"
                              />
                            )}
                          </div>
                        </div>
                        {meals.map((meal) => (
                          <div key={meal.id} className="flex items-start justify-between border-t border-border py-[7px]">
                            <div className="flex-1">
                              <span className="text-[13px] text-text">
                                {MEAL_SLOT_LABEL[meal.meal_slot]} {meal.title}
                              </span>
                              {meal.calculation_source && (
                                <span className="ml-1.5 rounded-[4px] bg-bg px-1 py-[1px] text-[9px] font-semibold uppercase text-meta">
                                  {meal.calculation_source === "off" ? "OFF" : meal.calculation_source === "mixed" ? "CIQUAL+OFF" : "CIQUAL"}
                                </span>
                              )}
                            </div>
                            <span className="ml-2 shrink-0 text-[11px] font-semibold text-meta">
                              {meal.calories !== null ? `~${Math.round(meal.calories)} kcal` : "—"}
                            </span>
                          </div>
                        ))}
                      </Card>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3.5 lg:col-span-5">
                  {shoppingItems.length > 0 && (
                    <Card className="flex flex-col rounded-2xl border border-border/80 shadow-[0_2px_8px_rgba(26,31,60,0.04)] lg:max-h-[570px]">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h3 className="m-0 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                            🛒 Liste de courses
                          </h3>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-navy">
                              {shoppingItems.filter((it) => checks.get(it.key)).length} / {shoppingItems.length} cochés
                            </span>
                            {budget !== null && (
                              <span className="rounded-[6px] bg-green-soft px-1.5 py-0.5 text-[10px] font-bold text-green-text">
                                {budget}€/sem
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setHideChecked((h) => !h)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            hideChecked
                              ? "bg-navy text-gold shadow-xs"
                              : "bg-slate-100 text-meta hover:text-navy"
                          }`}
                        >
                          {hideChecked ? "Afficher tout" : "Masquer cochés"}
                        </button>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-green transition-all duration-300"
                          style={{
                            width: `${(shoppingItems.filter((it) => checks.get(it.key)).length / (shoppingItems.length || 1)) * 100}%`,
                          }}
                        />
                      </div>

                      {/* Aisle Accordions - Scrollable with luxury scrollbar confined within the card */}
                      <div className="divide-y divide-border/60 overflow-y-auto luxury-scrollbar pr-1.5 max-h-[400px] lg:max-h-[440px]">
                        {shoppingByAisle.map((group) => {
                          const visibleItems = hideChecked
                            ? group.items.filter((it) => !checks.get(it.key))
                            : group.items;
                          if (visibleItems.length === 0) return null;

                          const isCollapsed = collapsedAisles.has(group.aisle);
                          const checkedInAisle = group.items.filter((it) => checks.get(it.key)).length;

                          return (
                            <div key={group.aisle} className="py-2">
                              <button
                                type="button"
                                onClick={() => toggleAisleCollapse(group.aisle)}
                                className="flex w-full items-center justify-between py-1 text-left cursor-pointer group"
                              >
                                <span className="text-[11px] font-bold uppercase tracking-wider text-green-text flex items-center gap-1.5">
                                  <span>{isCollapsed ? "▸" : "▾"}</span>
                                  <span>{group.aisle}</span>
                                </span>
                                <span className="text-[10px] font-bold text-meta group-hover:text-navy">
                                  {checkedInAisle}/{group.items.length}
                                </span>
                              </button>

                              {!isCollapsed && (
                                <div className="mt-1 flex flex-col gap-1">
                                  {visibleItems.map((item) => {
                                    const isChecked = checks.get(item.key) ?? false;
                                    return (
                                      <button
                                        key={item.key}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={isChecked}
                                        onClick={() => onToggleCheck(item.key, isChecked)}
                                        disabled={togglingKeys.has(item.key)}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
                                      >
                                        <div
                                          aria-hidden="true"
                                          className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-all ${
                                            isChecked
                                              ? "border-green bg-green text-white"
                                              : "border-slate-300 bg-white"
                                          }`}
                                        >
                                          {isChecked && <span className="text-[10px] font-bold">✓</span>}
                                        </div>
                                        <span className={`flex-1 text-xs ${isChecked ? "text-meta line-through opacity-70" : "text-navy font-medium"}`}>
                                          {item.name} <span className="text-meta font-normal">({Math.round(item.grams)}g)</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {lastRepas.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                      <h3 className="mb-2.5 text-xs font-bold uppercase text-meta" style={{ letterSpacing: "0.07em" }}>
                        🍽️ Repas récents
                      </h3>
                      <div className="flex flex-col gap-2">
                        {lastRepas
                          .slice()
                          .reverse()
                          .slice(0, 3)
                          .map(({ date, repas }) => (
                            <div key={date} className="rounded-xl border border-border/70 bg-slate-50/60 p-2.5">
                              <p className="mb-0.5 text-[11px] font-bold text-meta">
                                {/* Local-midnight parse, not bare new Date(date) — a plain
                                    YYYY-MM-DD string parses as UTC midnight, which can land on
                                    the previous local calendar day east of UTC. Same pattern as
                                    dayLabel() above. */}
                                {new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}
                              </p>
                              <p className="m-0 text-xs font-semibold text-navy truncate">{repas}</p>
                            </div>
                          ))}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "recette" && (
          <div className="flex flex-col gap-5 lg:h-full lg:overflow-y-auto luxury-scrollbar pr-1 pb-16">
            {/* Search & Prompt Generator Hero Card */}
            <Card className="rounded-2xl border border-border/80 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 shadow-[0_2px_12px_rgba(26,31,60,0.04)]">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-gold shadow-xs">
                      <ChefHat className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-extrabold text-navy tracking-tight">Chef Claré — Recette Sur-Mesure</h2>
                      <p className="text-[12px] text-text-mid">Dis-moi ce que tu as dans ton frigo ou ce qui te ferait plaisir.</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-gold-text">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>IA Nutrition</span>
                  </div>
                </div>

                {!entitlementLoading && !aiEntitled ? (
                  <UpgradePrompt message="La recherche de recette par Claré est réservée aux membres Premium." />
                ) : (
                  <>
                    {/* Suggestion Chips */}
                    <div>
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-meta">
                        Suggestions rapides :
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {CRAVING_SUGGESTIONS.map((sug, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRecetteEnvie(sug.text)}
                            className="cursor-pointer rounded-lg border border-border/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy transition-all duration-150 hover:border-gold hover:bg-gold-soft/40 active:scale-95 shadow-xs"
                          >
                            {sug.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Input form */}
                    <div className="flex flex-col sm:flex-row items-center gap-2.5">
                      <div className="relative w-full flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-meta pointer-events-none" />
                        <input
                          id="recette-envie"
                          value={recetteEnvie}
                          onChange={(e) => setRecetteEnvie(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && recetteEnvie.trim() && !loadingRecette) {
                              genRecette();
                            }
                          }}
                          placeholder="Ex : Poulet rôti aux herbes, bowl saumon avocat, rapide 15 min..."
                          className="box-border w-full rounded-xl bg-slate-50/80 pl-10 pr-9 py-2.5 font-ui text-sm text-text transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/20"
                          style={{ border: `1.5px solid ${recetteEnvie ? "var(--color-navy)" : "var(--color-border)"}` }}
                        />
                        {recetteEnvie && (
                          <button
                            type="button"
                            onClick={() => setRecetteEnvie("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-meta hover:text-navy cursor-pointer text-base"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <Button
                        onClick={genRecette}
                        disabled={loadingRecette || !recetteEnvie.trim()}
                        className="w-full sm:w-auto shrink-0 rounded-xl bg-navy text-gold font-bold px-5 py-2.5 hover:bg-navy-800 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loadingRecette ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin text-gold" />
                            <span>Claré cuisine...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            <span>Trouver ma recette</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Error state */}
            {recetteResult && recetteResult.erreur && (
              <Card className="rounded-2xl bg-red-soft border border-red/30 p-4 shadow-sm">
                <p className="mb-1 text-[13px] font-bold text-red-text">⚠️ {recetteResult.erreur}</p>
                <Button variant="primary" onClick={genRecette} disabled={loadingRecette} className="mt-2">
                  Nouvelle tentative →
                </Button>
              </Card>
            )}

            {/* Generated Recipe Details */}
            {recetteResult && !recetteResult.erreur && (
              <div className="flex flex-col gap-4">
                {/* Top Banner Card */}
                <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-green-text">
                        ✨ Recette Recommandée
                      </span>
                      <h2 className="text-[20px] font-extrabold text-navy tracking-tight mt-0.5">
                        {recetteResult.nom}
                      </h2>
                      <div className="flex items-center gap-3 mt-2">
                        {recetteResult.temps && (
                          <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-navy">
                            <Clock className="h-3.5 w-3.5 text-meta" />
                            {recetteResult.temps}
                          </span>
                        )}
                        {recetteResult.calories && (
                          <span className="flex items-center gap-1.5 rounded-lg bg-green-soft px-2.5 py-1 text-[11px] font-extrabold text-green-text">
                            <Flame className="h-3.5 w-3.5" />
                            ~{recetteResult.calories} kcal
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addFavori}
                      disabled={savingFavori}
                      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                        favoris.some((f) => f.titre === (recetteResult.nom || recetteEnvie))
                          ? "bg-gold-soft text-gold-text border border-gold/40"
                          : "bg-navy text-gold hover:bg-navy-800"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${favoris.some((f) => f.titre === (recetteResult.nom || recetteEnvie)) ? "fill-gold text-gold" : ""}`} />
                      <span>
                        {favoris.some((f) => f.titre === (recetteResult.nom || recetteEnvie))
                          ? "Dans mes favoris"
                          : "Sauvegarder"}
                      </span>
                    </button>
                  </div>
                </Card>

                {/* 2-Column Details: Ingrédients & Étapes */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4.5 items-start">
                  {/* Left: Ingredients */}
                  {recetteResult.ingredients && recetteResult.ingredients.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)] lg:col-span-5">
                      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-border/60">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-green-text flex items-center gap-1.5">
                          <Utensils className="h-4 w-4" />
                          Ingrédients ({recetteResult.ingredients.length})
                        </h3>
                      </div>
                      <div className="flex flex-col gap-2">
                        {recetteResult.ingredients.map((ing, i) => (
                          <div key={i} className="flex items-start gap-2.5 rounded-lg bg-slate-50/70 p-2 text-xs text-navy font-medium">
                            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green" />
                            <span>{ing}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Right: Step-by-Step Instructions */}
                  {recetteResult.etapes && recetteResult.etapes.length > 0 && (
                    <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_8px_rgba(26,31,60,0.04)] lg:col-span-7">
                      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-border/60">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4 text-gold" />
                          Étapes de préparation ({recetteResult.etapes.length})
                        </h3>
                      </div>
                      <div className="flex flex-col gap-3">
                        {recetteResult.etapes.map((etape, i) => (
                          <div key={i} className="flex items-start gap-3 rounded-xl border border-border/70 bg-white p-3.5 shadow-xs">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy text-[11px] font-extrabold text-gold">
                              {i + 1}
                            </div>
                            <p className="m-0 text-xs text-navy/90 leading-relaxed font-normal">
                              {etape}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "favoris" && (
          <div className="flex flex-col gap-4 lg:h-full lg:overflow-y-auto luxury-scrollbar pr-1 pb-16">
            {favoris.length === 0 ? (
              <EmptyState
                icon="⭐"
                title="Aucune recette sauvegardée"
                description="Enregistre une recette depuis l'onglet « Une envie ? » pour la retrouver ici en un clic."
                ctaLabel="Explorer des recettes →"
                onCtaClick={() => setTab("recette")}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[16px] font-extrabold text-navy tracking-tight">
                      Mes Recettes Favorites ({favoris.length})
                    </h2>
                    <p className="text-[12px] text-text-mid">Tes recettes enregistrées prêtes à être cuisinées.</p>
                  </div>
                  <Button
                    onClick={() => setTab("recette")}
                    variant="primary"
                    size="sm"
                    className="rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Nouvelle envie</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favoris.map((f) => {
                    const isExpanded = expandedFavoris.has(f.id);
                    return (
                      <Card
                        key={f.id}
                        className="flex flex-col justify-between rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.04)] transition-all hover:shadow-[0_4px_14px_rgba(26,31,60,0.07)]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <span className="text-base">⭐</span>
                              <h3 className="text-sm font-extrabold text-navy leading-snug">
                                {f.titre}
                              </h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFavori(f.id)}
                              aria-label={`Supprimer ${f.titre}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-red-soft hover:text-red cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="mt-2.5 flex items-center gap-2">
                            {f.contenu?.temps && (
                              <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-navy">
                                <Clock className="h-3 w-3 text-meta" />
                                {f.contenu.temps}
                              </span>
                            )}
                            {f.contenu?.calories && (
                              <span className="flex items-center gap-1 rounded-md bg-green-soft px-2 py-0.5 text-[10px] font-extrabold text-green-text">
                                <Flame className="h-3 w-3" />
                                {f.contenu.calories} kcal
                              </span>
                            )}
                          </div>

                          {/* Collapsible Ingredients & Steps Preview */}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => toggleFavoriExpand(f.id)}
                              className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-navy hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <span>{isExpanded ? "Masquer les détails" : "Voir ingrédients & étapes"}</span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-meta" /> : <ChevronDown className="h-3.5 w-3.5 text-meta" />}
                            </button>

                            {isExpanded && (
                              <div className="mt-2.5 flex flex-col gap-2.5 border-t border-border/60 pt-2 text-xs">
                                {f.contenu?.ingredients && f.contenu.ingredients.length > 0 && (
                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-green-text">
                                      Ingrédients
                                    </p>
                                    <div className="flex flex-col gap-1">
                                      {f.contenu.ingredients.map((ing, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-text-mid">
                                          <span className="h-1.5 w-1.5 rounded-full bg-green shrink-0" />
                                          <span className="truncate">{ing}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {f.contenu?.etapes && f.contenu.etapes.length > 0 && (
                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-navy">
                                      Étapes
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                      {f.contenu.etapes.map((etape, i) => (
                                        <p key={i} className="m-0 text-[11px] text-text-mid leading-tight">
                                          <strong className="text-navy">{i + 1}.</strong> {etape}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 border-t border-border/40 pt-2 text-[10px] font-semibold text-meta">
                          Enregistré le {new Date(f.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
