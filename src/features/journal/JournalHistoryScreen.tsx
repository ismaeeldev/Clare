import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip
} from "recharts";
import {
  RefreshCw,
  Download,
  Zap,
  Smile,
  DollarSign,
  Folder,
  TrendingUp,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  BookOpen
} from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/InlineError";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiTimeoutError } from "@/lib/apiClient";
import { exportJournalAndFinanceData } from "@/lib/exportData";
import { fetchEntries, fetchFinanceEntries, type FinanceEntryRow, type JournalEntryRow } from "@/lib/journalRepo";
import { FinanceQuickAdd } from "./FinanceQuickAdd";

/**
 * `entry_date` is stored as a local-calendar `YYYY-MM-DD` key (see
 * src/lib/dateUtils.ts's `dateKey`), never a UTC instant. Handing that
 * string straight to `new Date(...)` parses it as UTC midnight, which
 * `toLocaleDateString` then renders back in the viewer's local timezone —
 * shifting the displayed date back a day for anyone west of UTC. Parsing
 * the Y/M/D components explicitly keeps the displayed date identical to
 * the stored key regardless of viewer timezone.
 */
function parseEntryDate(entryDate: string): Date {
  const [y, m, d] = entryDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-[1240px]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={85} radius="xl" />
        ))}
      </div>
      <Skeleton height={220} radius="xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} height={100} radius="xl" />
      ))}
    </div>
  );
}

export function JournalHistoryScreen({ userId, onBack }: { userId: string; onBack?: () => void }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/settings");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportSuccess(false);
    try {
      await exportJournalAndFinanceData(userId);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3500);
    } catch {
      // Handled
    } finally {
      setExporting(false);
    }
  };

  const load = async (isManualRefresh = false) => {
    if (isManualRefresh || entries.length > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const [rows, finance] = await Promise.all([fetchEntries(userId, 60), fetchFinanceEntries(userId, 100)]);
      setEntries(rows);
      setFinanceEntries(finance);
    } catch (err) {
      setError(err instanceof ApiTimeoutError ? "Le chargement prend trop de temps. Vérifie ta connexion et réessaie." : "Le chargement a échoué.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const totalRevenue = financeEntries.filter((f) => f.type === "revenue").reduce((s, f) => s + f.amount, 0);
  const totalExpenses = financeEntries.filter((f) => f.type === "expense").reduce((s, f) => s + f.amount, 0);
  const netFinances = totalRevenue - totalExpenses;

  const validEnergyEntries = entries.filter((e) => typeof e.energy === "number");
  const avgEnergy = validEnergyEntries.length > 0
    ? (validEnergyEntries.reduce((acc, e) => acc + (e.energy || 0), 0) / validEnergyEntries.length).toFixed(1)
    : "-";

  const validMoodEntries = entries.filter((e) => typeof e.mood === "number");
  const avgMood = validMoodEntries.length > 0
    ? (validMoodEntries.reduce((acc, e) => acc + (e.mood || 0), 0) / validMoodEntries.length).toFixed(1)
    : "-";

  const chartData = [...entries]
    .reverse()
    .map((e) => ({
      date: parseEntryDate(e.entry_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      energie: e.energy ?? null,
      humeur: e.mood ?? null,
    }));

  const renderHeader = () => (
    <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton onClick={handleBack} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                Archives & Exportation
              </span>
              {refreshing && (
                <span className="text-[11px] font-medium text-meta">· Actualisation...</span>
              )}
            </div>
            <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
              Historique & Données
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
            aria-label="Actualiser l'historique"
            title="Actualiser"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-gold" : "text-navy"}`} />
          </button>

          {entries.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 font-bold cursor-pointer"
            >
              <Download className={`h-4 w-4 ${exporting ? "animate-bounce text-gold" : "text-navy"}`} />
              <span className="hidden sm:inline">{exporting ? "Génération CSV..." : "Exporter mes données"}</span>
              <span className="sm:hidden">{exporting ? "..." : "Export"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (loading && entries.length === 0) {
    return (
      <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
        {renderHeader()}
        <HistorySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
        {renderHeader()}
        <div className="px-6 py-8 lg:mx-auto lg:max-w-[1240px]">
          <InlineError message={error} onRetry={() => load()} />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
        {renderHeader()}
        <div className="px-6 py-12 lg:mx-auto lg:max-w-[1240px]">
          <EmptyState
            icon="📓"
            title="Aucune entrée pour l'instant"
            description="Écris ta première journée dans le journal pour commencer à suivre ton énergie, ton humeur et tes finances."
            ctaLabel="Écrire ma journée"
            onCtaClick={() => navigate("/journal")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-24 lg:pb-8 font-ui">
      {renderHeader()}

      <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-6 flex flex-col gap-6">
        {/* Export Success Alert */}
        {exportSuccess && (
          <Card className="border border-emerald-200 bg-emerald-50/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <p className="text-xs font-bold text-emerald-800">
                Fichier CSV généré avec succès ! Le téléchargement a démarré.
              </p>
            </div>
          </Card>
        )}

        {/* 3 Metric Overview Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-meta">Journées Notées</p>
              <p className="font-extrabold text-navy text-lg">{entries.length} jours</p>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-text">
              <Zap className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-meta">Énergie Moyenne</p>
              <p className="font-extrabold text-navy text-lg">{avgEnergy} <span className="text-xs font-normal text-meta">/ 5</span></p>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-soft text-purple-text">
              <Smile className="h-5 w-5 text-purple" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-meta">Humeur Moyenne</p>
              <p className="font-extrabold text-navy text-lg">{avgMood} <span className="text-xs font-normal text-meta">/ 5</span></p>
            </div>
          </Card>
        </div>

        {/* Trend Graph Card */}
        <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-gold" />
                Évolution de ton Énergie & Humeur
              </p>
              <p className="text-xs text-meta mt-0.5">Courbe des {chartData.length} dernières entrées enregistrées</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-navy">
                <span className="h-2.5 w-2.5 rounded-full bg-gold" /> Énergie (1-5)
              </span>
              <span className="flex items-center gap-1.5 text-navy">
                <span className="h-2.5 w-2.5 rounded-full bg-purple" /> Humeur (1-5)
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: "var(--color-text-mid)" }} 
                  axisLine={{ stroke: "var(--color-border)" }} 
                  tickLine={false} 
                />
                <YAxis domain={[1, 5]} hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "white", 
                    borderRadius: "12px", 
                    border: "1px solid #e2e8f0", 
                    boxShadow: "0 4px 12px rgba(26,31,60,0.08)", 
                    fontSize: "12px",
                    fontWeight: 600 
                  }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="energie" 
                  name="Énergie" 
                  stroke="var(--color-gold)" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: "var(--color-gold)" }} 
                  activeDot={{ r: 5 }} 
                  connectNulls 
                />
                <Line 
                  type="monotone" 
                  dataKey="humeur" 
                  name="Humeur" 
                  stroke="var(--color-purple)" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: "var(--color-purple)" }} 
                  activeDot={{ r: 5 }} 
                  connectNulls 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Financial Flow Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Card className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_2px_10px_rgba(26,31,60,0.03)]">
              <p className="text-xs font-bold uppercase tracking-wider text-navy mb-3 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Bilan Financier Global
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-border/70 bg-emerald-50/50 p-2.5">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Revenus</p>
                  <p className="font-extrabold text-emerald-700 text-sm mt-0.5">+{totalRevenue.toFixed(0)}€</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-red-50/50 p-2.5">
                  <p className="text-[10px] font-bold text-red-700 uppercase">Dépenses</p>
                  <p className="font-extrabold text-red-700 text-sm mt-0.5">-{totalExpenses.toFixed(0)}€</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-bold text-navy uppercase">Net</p>
                  <p className={`font-extrabold text-sm mt-0.5 ${netFinances >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {netFinances >= 0 ? `+${netFinances.toFixed(0)}€` : `${netFinances.toFixed(0)}€`}
                  </p>
                </div>
              </div>
            </Card>

            <FinanceQuickAdd 
              userId={userId} 
              onAdded={(entry) => setFinanceEntries((prev) => [entry, ...prev])} 
            />
          </div>

          {/* Detailed Entries List */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-meta mb-1">
              Historique des Entrées ({entries.length})
            </p>
            {entries.map((e) => (
              <Card 
                key={e.id} 
                className="rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-navy capitalize">
                    {parseEntryDate(e.entry_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {e.energy && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold-text">
                        ⚡ {e.energy}/5
                      </span>
                    )}
                    {e.mood && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-purple-soft px-2 py-0.5 text-[11px] font-bold text-purple-text">
                        😊 {e.mood}/5
                      </span>
                    )}
                  </div>
                </div>

                {e.text_content && (
                  <p className="mb-3 text-xs text-text-mid leading-relaxed select-text">
                    {e.text_content}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
                  {(e.revenue ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                      <ArrowUpRight className="h-3 w-3" /> +{e.revenue}€
                    </span>
                  )}
                  {(e.expenses ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-200">
                      <ArrowDownRight className="h-3 w-3" /> -{e.expenses}€
                    </span>
                  )}
                  {e.project_touched && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-navy">
                      <Folder className="h-3 w-3 text-gold" /> {e.project_touched}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

