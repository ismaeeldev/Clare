import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  onClick: () => void;
  variant?: "light" | "dark";
  className?: string;
}

/**
 * BackButton — Sleek navigation back button with high-contrast light and dark support
 */
export function BackButton({ onClick, variant = "light", className }: BackButtonProps) {
  const isDark = variant === "dark";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      className={cn(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all duration-200 active:scale-95",
        // Same keyboard-focus fix already applied to Button app-wide (no
        // variant had a visible focus-visible ring — WCAG 2.4.7) — this was
        // the one other clickable primitive still missing it.
        "outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
        isDark
          ? "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.16]"
          : "border border-border/80 bg-white text-navy hover:bg-bg-dark shadow-xs",
        className
      )}
    >
      <ChevronLeft size={18} strokeWidth={2.25} />
    </button>
  );
}
