import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { HistoriqueFiltre, HistoriqueScreenProps } from "./types";

const FILTRES: { val: HistoriqueFiltre; label: string }[] = [
  { val: "tout", label: "Tout" },
  { val: "sport", label: "🏃 Sport" },
  { val: "revenus", label: "💰 Revenus" },
  { val: "energie", label: "⚡ Bonne énergie" },
];

/**
 * HistoriqueScreen — extracted from App.jsx's Historique component
 * (lines 3866-4002). Quick-stats header, a 30-day energy sparkline (raw
 * SVG, ported verbatim including its point-math), filterable journal list.
 *
 * Note: an earlier read of App.jsx surfaced 3 stacked "// ─── SCREEN"
 * comments at lines 3464-3466 (Historique/Mes Idées/Mes Lieux) immediately
 * followed by constants, not a function — that's stray/duplicate comment
 * residue from an earlier reorder, not a real second Historique screen.
 * The actual Historique function starts at line 3867 (confirmed via
 * `grep -n "^function "`), which is what this file ports.
 */
export function HistoriqueScreen({ journal }: HistoriqueScreenProps) {
  const [filtre, setFiltre] = useState<HistoriqueFiltre>("tout");
  const last30 = journal.slice(-30);

  const totalSport = journal.filter((j) => j.sport === "oui").length;
  const totalRev = journal.reduce((s, j) => s + parseFloat(String(j.revenus || 0)), 0);
  const avgEnergieTout = journal.length ? (journal.reduce((s, j) => s + (j.energie || 3), 0) / journal.length).toFixed(1) : "-";

  const energiePts = last30.map((j) => j.energie || 3);
  const maxE = 5;

  const jFiltre = [...journal].reverse().filter((j) => {
    if (filtre === "sport") return j.sport === "oui";
    if (filtre === "revenus") return parseFloat(String(j.revenus || 0)) > 0;
    if (filtre === "energie") return (j.energie || 3) >= 4;
    return true;
  });

  return (
    <div className="pb-28 font-ui">
      <div className="bg-navy px-6 pb-6 pt-[52px]">
        <h1 className="mb-1 text-[22px] font-extrabold text-white" style={{ letterSpacing: "-0.02em" }}>
          🗂️ Historique
        </h1>
        <p className="m-0 text-[13px] text-white/60">{journal.length} journées enregistrées</p>

        {journal.length > 0 && (
          <div className="mt-4 flex gap-2">
            {[
              { icon: "🏃", val: `${totalSport}`, label: "séances sport" },
              { icon: "💰", val: `${totalRev.toFixed(0)}€`, label: "revenus totaux" },
              { icon: "⚡", val: `${avgEnergieTout}/5`, label: "énergie moy." },
            ].map(({ icon, val, label }) => (
              <div key={label} className="flex-1 rounded-[12px] bg-white/[0.08] p-2.5 text-center">
                <p className="mb-0.5 text-base">{icon}</p>
                <p className="m-0 text-sm font-extrabold text-gold">{val}</p>
                <p className="mt-0.5 text-[10px] text-white/50">{label}</p>
              </div>
            ))}
          </div>
        )}

        {last30.length > 4 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10px] font-bold text-white/40" style={{ letterSpacing: "0.08em" }}>
              ÉNERGIE — 30 JOURS
            </p>
            <svg width="100%" height="40" viewBox={`0 0 ${last30.length * 10} 40`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <polygon
                points={[`0,40`, ...energiePts.map((e, i) => `${i * 10 + 5},${40 - (e / maxE) * 36}`), `${(last30.length - 1) * 10 + 5},40`].join(" ")}
                fill="url(#eg)"
              />
              <polyline
                points={energiePts.map((e, i) => `${i * 10 + 5},${40 - (e / maxE) * 36}`).join(" ")}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {FILTRES.map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setFiltre(val)}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border-none px-3.5 py-[7px] font-ui text-xs font-bold ${
                filtre === val ? "bg-navy text-white" : "bg-white text-text-mid"
              }`}
              style={filtre === val ? undefined : { boxShadow: "0 0 0 1.5px var(--color-border) inset" }}
            >
              {label}
            </button>
          ))}
        </div>

        {journal.length === 0 ? (
          <div className="px-0 py-10 text-center">
            <p className="text-[32px]">📓</p>
            <p className="text-sm text-text-mid">Aucune journée encore. Commence par "Ma journée".</p>
          </div>
        ) : jFiltre.length === 0 ? (
          <div className="px-0 py-10 text-center">
            <p className="text-[32px]">🔍</p>
            <p className="text-sm text-text-mid">Aucune journée correspond à ce filtre.</p>
          </div>
        ) : (
          jFiltre.map((j) => (
            <Card key={j.date} className="mb-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold text-navy">
                  {new Date(j.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </span>
                <div className="flex gap-[5px]">
                  <span
                    className="rounded-[10px] px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      background: j.sport === "oui" ? "var(--color-green-soft)" : j.sport === "léger" ? "var(--color-gold-light)" : "var(--color-red-soft)",
                      color: j.sport === "oui" ? "var(--color-green)" : j.sport === "léger" ? "var(--color-gold)" : "var(--color-red)",
                    }}
                  >
                    {j.sport === "oui" ? "🏃" : j.sport === "léger" ? "🚶" : "—"}{" "}
                  </span>
                  <span className="rounded-[10px] bg-gold-light px-2 py-0.5 text-[11px] font-bold text-gold">⚡{j.energie || "-"}</span>
                  <span className="rounded-[10px] bg-purple-soft px-2 py-0.5 text-[11px] font-bold text-purple">😊{j.humeur || "-"}</span>
                </div>
              </div>
              {j.texte && (
                <p className="mb-2 text-[13px] text-text-mid" style={{ lineHeight: 1.55 }}>
                  {j.texte.slice(0, 150)}
                  {j.texte.length > 150 ? "..." : ""}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {parseFloat(String(j.revenus)) > 0 && <span className="text-xs font-bold text-green">+{j.revenus}€</span>}
                {parseFloat(String(j.depenses)) > 0 && <span className="text-xs font-bold text-red">-{j.depenses}€</span>}
                {j.projet && <span className="text-xs text-text-light">📁 {j.projet}</span>}
                {j.repas && <span className="text-xs text-text-light">🍽️ {j.repas.slice(0, 30)}</span>}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
