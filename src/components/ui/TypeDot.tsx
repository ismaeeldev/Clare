/**
 * TypeDot — extracted verbatim from App.jsx lines 454-457. Small colored
 * dot indicating an agenda event's type, used by PrepDimanche's agenda
 * preview list (Agenda's own event rows use an inline equivalent — kept
 * separate since Agenda's dot has a different shape: 10x10 rounded-[3px]
 * square vs this component's 8x8 circle).
 */
export type AgendaEventType = "rdv" | "sport" | "perso" | "déplacement" | "focus";

const TYPE_COLOR_VARS: Record<AgendaEventType, string> = {
  rdv: "var(--color-navy)",
  sport: "var(--color-green)",
  perso: "var(--color-amber)",
  déplacement: "var(--color-gold)",
  focus: "var(--color-purple)",
};

export interface TypeDotProps {
  type: string;
}

export function TypeDot({ type }: TypeDotProps) {
  const color = TYPE_COLOR_VARS[type as AgendaEventType] ?? "var(--color-text-light)";
  return <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}
