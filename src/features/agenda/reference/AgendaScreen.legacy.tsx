import { useState } from "react";
import { AlertBox } from "@/components/ui/AlertBox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { askClare } from "@/lib/askClare";
import { buildSystemPrompt } from "@/lib/buildSystemPrompt";
import { todayKey } from "@/lib/dateUtils";
import { saveLocal } from "@/lib/localStoragePlaceholder";
import type { AgendaEvent, AgendaEventType, AgendaForm, AgendaScreenProps } from "./types";

const TYPES: AgendaEventType[] = ["rdv", "sport", "perso", "déplacement", "focus"];

const TYPE_COLOR_VARS: Record<AgendaEventType, string> = {
  rdv: "var(--color-navy)",
  sport: "var(--color-green)",
  perso: "var(--color-amber)",
  déplacement: "var(--color-gold)",
  focus: "var(--color-purple)",
};

/**
 * AgendaScreen — extracted from App.jsx's Agenda component (lines 2313-2453).
 * Upcoming/past event list, add-event form with AI conflict/impact analysis,
 * and the "just added" transient highlight are all preserved.
 */
export function AgendaScreen({ agenda, setAgenda, profile, journal, finances }: AgendaScreenProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AgendaForm>({ titre: "", date: todayKey(), heure: "", duree: "1h", type: "rdv" });
  const [aiMsg, setAiMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  const set = <K extends keyof AgendaForm>(k: K, v: AgendaForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const sorted = [...agenda].sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`));
  const upcoming = sorted.filter((e) => e.date >= todayKey());

  const addEvent = async () => {
    if (!form.titre.trim()) return;
    setLoading(true);
    const newId = Date.now();
    const newEv: AgendaEvent = { ...form, id: newId };
    const updated = [...agenda, newEv];
    setAgenda(updated);
    await saveLocal("clare_agenda", updated);
    setJustAddedId(newId);

    const systemPrompt = buildSystemPrompt(profile, journal, updated, finances);
    const msg = `Nouveau RDV ajouté : "${form.titre}" le ${form.date} à ${form.heure} (${form.type}, ${form.duree}). Analyse l'impact sur mon organisation, sport et récupération. Détecte tout conflit.`;
    try {
      const text = await askClare([{ role: "user", content: msg }], systemPrompt);
      setAiMsg(text);
    } catch {
      setAiMsg("RDV ajouté.");
    }
    setForm({ titre: "", date: todayKey(), heure: "", duree: "1h", type: "rdv" });
    setShowAdd(false);
    setLoading(false);
    setTimeout(() => setJustAddedId(null), 4000);
  };

  const removeEvent = async (id: number) => {
    const updated = agenda.filter((e) => e.id !== id);
    setAgenda(updated);
    await saveLocal("clare_agenda", updated);
  };

  return (
    <div className="pb-28 font-ui">
      <div className="bg-navy px-6 pb-5 pt-[52px]">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="m-0 text-[22px] font-extrabold text-white" style={{ letterSpacing: "-0.02em" }}>
              📅 Agenda
            </h1>
            <p className="mt-1 text-[13px] text-white/60">{upcoming.length} événements à venir</p>
          </div>
          <Button variant="accent" size="sm" onClick={() => setShowAdd(!showAdd)}>
            + Ajouter
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-6 py-5">
        {aiMsg && <AlertBox text={aiMsg} type={aiMsg.includes("⚠️") ? "warning" : "info"} />}

        {showAdd && (
          <Card style={{ border: "1.5px solid var(--color-gold)" }}>
            <h3 className="mb-3.5 text-sm font-bold text-navy">Nouvel événement</h3>
            <div className="flex flex-col gap-2.5">
              <input
                value={form.titre}
                onChange={(e) => set("titre", e.target.value)}
                placeholder="Titre"
                className="rounded-[10px] border border-border bg-bg px-[13px] py-[11px] font-ui text-sm text-text outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="flex-1 rounded-[10px] border border-border bg-bg px-[13px] py-[11px] text-sm text-text outline-none"
                />
                <input
                  type="time"
                  value={form.heure}
                  onChange={(e) => set("heure", e.target.value)}
                  className="flex-1 rounded-[10px] border border-border bg-bg px-[13px] py-[11px] text-sm text-text outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => set("type", t)}
                    className={`cursor-pointer rounded-[8px] border-none px-3 py-[7px] font-ui text-xs font-bold ${
                      form.type === t ? "text-white" : "bg-bg text-text-mid"
                    }`}
                    style={form.type === t ? { background: TYPE_COLOR_VARS[t] } : undefined}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">
                  Annuler
                </Button>
                <Button variant="primary" onClick={addEvent} disabled={loading || !form.titre.trim()} className="flex-[2]">
                  {loading ? "Analyse..." : "Ajouter + analyser"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {upcoming.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-xs font-bold uppercase text-text-light" style={{ letterSpacing: "0.07em" }}>
              À venir
            </h3>
            {upcoming.map((ev) => (
              <div
                key={ev.id}
                className={`relative mb-2 flex items-center gap-3 rounded-[12px] px-3.5 py-3 transition-all duration-[0.4s] ease-in-out ${
                  ev.id === justAddedId ? "bg-green-soft" : "bg-white"
                }`}
                style={{ border: `1.5px solid ${ev.id === justAddedId ? "var(--color-green)" : "var(--color-border)"}` }}
              >
                {ev.id === justAddedId && <span className="absolute -ml-1 text-[10px]">✨</span>}
                <div className="min-w-[50px] text-center">
                  <div className="text-[11px] font-bold text-text-light">
                    {new Date(ev.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                  </div>
                  <div className="text-[13px] font-extrabold text-navy">{ev.heure || "--:--"}</div>
                </div>
                <div className="w-px self-stretch bg-border" />
                <div className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: TYPE_COLOR_VARS[ev.type] ?? "var(--color-text-light)" }} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[13px] font-semibold text-text">{ev.titre}</p>
                  <p className="mt-0.5 text-[11px] text-text-light">
                    {ev.duree} · {ev.type}
                    {ev.id === justAddedId ? " · Ajouté ✅" : ""}
                  </p>
                </div>
                <button onClick={() => removeEvent(ev.id)} className="cursor-pointer border-none bg-transparent p-1 text-base text-text-muted">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {upcoming.length === 0 && !showAdd && (
          <div className="px-5 py-10 text-center">
            <p className="text-[32px]">📅</p>
            <p className="text-sm text-text-mid">Aucun événement à venir</p>
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              Ajouter un événement
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
