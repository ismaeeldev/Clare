/**
 * AlertBox — extracted from App.jsx lines 434-452, verbatim (4 variants:
 * warning/success/info/focus). Radius verified precisely against source
 * (borderRadius: 12 = rounded-md here) per the recurring radius-mismatch
 * lesson from Home/Onboarding/Chat — deliberately NOT reused as
 * InlineError/EmptyState (Step 1.2.5), since those serve different
 * purposes (InlineError = recoverable error with Retry; AlertBox = a
 * general-purpose colored notice banner with 4 semantic tones, no retry
 * action).
 */
export type AlertBoxType = "warning" | "success" | "info" | "focus";

// Text colors use the "-text" (darkened) variants, not the raw brand
// accents — found via axe-core that warning/success/info's raw accent
// color on its own -soft tint background fails WCAG AA (2.13-3.19:1 vs the
// 4.5:1 minimum; only focus/purple happened to already pass at 4.57:1).
const VARIANTS: Record<AlertBoxType, { bg: string; border: string; icon: string; color: string }> = {
  warning: { bg: "bg-amber-soft", border: "border-amber/25", icon: "⚠️", color: "text-amber-text" },
  success: { bg: "bg-green-soft", border: "border-green/25", icon: "✅", color: "text-green-text" },
  info: { bg: "bg-gold-light", border: "border-gold/25", icon: "💡", color: "text-gold-text" },
  focus: { bg: "bg-purple-soft", border: "border-purple/25", icon: "🎯", color: "text-purple" },
};

export interface AlertBoxProps {
  text: string;
  type?: AlertBoxType;
}

export function AlertBox({ text, type = "warning" }: AlertBoxProps) {
  const s = VARIANTS[type];
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 ${s.bg} ${s.border}`}>
      <span className="text-[15px]">{s.icon}</span>
      <p className={`text-body-sm font-medium ${s.color}`} style={{ lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
}
