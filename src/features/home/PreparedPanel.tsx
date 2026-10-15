import { Sparkles, Check, ArrowRight } from "lucide-react";
import { SkeletonBlock } from "@/components/ui/Skeleton";

export interface PreparedProposal {
  id: string;
  agent: "meal_agent" | "revenue_agent" | "sport_agent";
  action_type: "acknowledge_meals" | "create_tasks_batch" | "create_task";
  title: string;
  body: string;
}

const AGENT_CONFIG: Record<
  PreparedProposal["agent"],
  { icon: string; tag: string; badgeColor: string }
> = {
  meal_agent: {
    icon: "🍽️",
    tag: "Nutrition & Repas",
    badgeColor: "bg-green-soft text-green-text border-green/30",
  },
  revenue_agent: {
    icon: "💶",
    tag: "Finances & Revenus",
    badgeColor: "bg-gold-soft text-gold-text border-gold/30",
  },
  sport_agent: {
    icon: "🏃",
    tag: "Entraînement",
    badgeColor: "bg-purple-soft text-purple-text border-purple/30",
  },
};

/**
 * Format markdown text with bold tags, bullet points, and numbered lists
 */
function FormattedProposalBody({ text }: { text: string }) {
  // Split paragraphs by double newlines or lines starting with numbers/bullets
  const lines = text.split(/\n+/).filter(Boolean);

  // If text is a single continuous paragraph with inline numbers like "1. **Squat**", format it
  const formattedSections = text.includes("1.") || text.includes("•") || text.includes("- ")
    ? text
        .replace(/(\d+\.\s+\*\*)/g, "\n$1")
        .replace(/(\*\*[^*]+\*\*)/g, "$1")
        .split(/\n+/)
        .filter(Boolean)
    : lines;

  return (
    <div className="space-y-2 text-body-sm text-text-mid leading-relaxed">
      {formattedSections.map((section, idx) => {
        // Parse bold markup **word** -> <strong>word</strong>
        const parts = section.split(/(\*\*[^*]+\*\*)/g);

        // Check if line is a numbered item or bullet
        const isNumbered = /^\s*\d+\./.test(section);
        const isAdvice = section.toLowerCase().includes("conseil") || section.toLowerCase().includes("recommandation");

        return (
          <div
            key={idx}
            className={
              isAdvice
                ? "rounded-xl border border-gold/25 bg-gold-soft/40 p-2.5 text-xs text-navy font-medium"
                : isNumbered
                ? "rounded-lg bg-bg/70 px-3 py-1.5 text-[13px]"
                : ""
            }
          >
            {parts.map((part, pIdx) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                const boldContent = part.slice(2, -2);
                return (
                  <strong key={pIdx} className="font-extrabold text-navy">
                    {boldContent}
                  </strong>
                );
              }
              return <span key={pIdx}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * PreparedPanel — Lavish "Claré a préparé pour vous" AI proposal panel
 */
export function PreparedPanel({
  proposals,
  loading,
  busyIds,
  errors,
  onConfirm,
}: {
  proposals: PreparedProposal[];
  loading: boolean;
  busyIds: Set<string>;
  errors: Record<string, string>;
  onConfirm: (proposal: PreparedProposal) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Chargement des propositions">
        <div className="rounded-2xl border border-gold/20 bg-white p-5 shadow-raised">
          <div className="flex items-center gap-2 mb-3">
            <SkeletonBlock width={22} height={22} radius="full" />
            <SkeletonBlock width={150} height={15} radius="sm" />
          </div>
          <SkeletonBlock width="95%" height={16} radius="sm" className="mb-2" />
          <SkeletonBlock width="70%" height={14} radius="sm" />
        </div>
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-green/25 bg-gradient-to-r from-green-soft to-white p-4 shadow-[0_2px_12px_rgba(45,155,111,0.06)]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green/15 text-green-text shadow-sm">
          <Check size={18} strokeWidth={2.5} />
        </div>
        <p className="m-0 text-body-sm font-semibold text-green-text">
          Toutes vos tâches et suggestions sont à jour. Claré veille en arrière-plan.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold-soft text-gold">
            <Sparkles size={14} />
          </div>
          <h3 className="m-0 text-label font-bold uppercase tracking-wider text-navy">
            Recommandation Active
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-gold-soft px-2.5 py-0.5 text-[11px] font-bold text-gold-text">
          {proposals.length} suggestion{proposals.length > 1 ? "s" : ""}
        </span>
      </div>

      {proposals.map((p) => {
        const config = AGENT_CONFIG[p.agent];
        const busy = busyIds.has(p.id);
        const error = errors[p.id];
        return (
          <div
            key={p.id}
            className="group relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-white via-white to-gold-soft/25 p-5 shadow-[0_4px_20px_rgba(26,31,60,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-floating"
          >
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent opacity-70" />

            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold/20 bg-gold-soft text-2xl shadow-sm transition-transform duration-200 group-hover:scale-105">
                {config.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badgeColor}`}
                  >
                    {config.tag}
                  </span>
                </div>
                <h4 className="m-0 font-display text-[16px] font-extrabold text-navy">
                  {p.title}
                </h4>
                <div className="mt-2.5">
                  <FormattedProposalBody text={p.body} />
                </div>
              </div>
            </div>

            {error && <p className="mt-3 text-body-sm text-red-text">{error}</p>}
            <div className="mt-4 flex items-center justify-end border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={() => onConfirm(p)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white shadow-sm transition-all duration-180 hover:bg-navy-800 hover:shadow-floating cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
              >
                <span>{busy ? "Enregistrement..." : "Confirmer & Enregistrer"}</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
