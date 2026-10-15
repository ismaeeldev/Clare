import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MicButton — Step 4.5's shared dictation-toggle button. Implements the
 * "Dictation/mic active" signature moment from docs/02_ThemeGuideline.md
 * §9.2 exactly: pulsing concentric rings around the mic button while
 * recording. Two staggered rings (pure CSS animation, no waveform library)
 * give the continuous outward-pulse effect the spec describes.
 *
 * Consumed by ChatScreen (header + input-row mic) and JournalScreen (main
 * text + sport-performance dictation) — previously each screen had its own
 * bespoke mic button with only a small pulsing dot elsewhere on screen, not
 * actually on the button itself; this closes that gap.
 */
export interface MicButtonProps {
  active: boolean;
  onClick: () => void;
  size?: "sm" | "md";
  /** "light" (default) for a light/bg-colored context; "dark" for use on a navy/dark header. */
  variant?: "light" | "dark";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const sizeClasses = {
  sm: "h-[38px] w-[38px]",
  md: "h-11 w-11",
};

const iconSizes = {
  sm: 18,
  md: 20,
};

// Hover feedback added during a Step 1-8 UI-polish pass — found missing
// (unlike every other significant interactive element: Button variants,
// BottomTabNav/SideNavRail tabs, Card's onClick variant).
const inactiveClasses = {
  light: "border-border bg-bg text-text hover:bg-bg-dark disabled:opacity-50 disabled:cursor-not-allowed",
  dark: "border-white/20 bg-white/[.15] text-white hover:bg-white/[.22] disabled:opacity-50 disabled:cursor-not-allowed",
};

export function MicButton({ active, onClick, size = "md", variant = "light", disabled = false, className, "aria-label": ariaLabel }: MicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (active ? "Arrêter la dictée" : "Démarrer la dictée")}
      aria-pressed={active}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-md border-[1.5px] transition-all duration-200",
        sizeClasses[size],
        active ? "border-red bg-red-solid text-white" : inactiveClasses[variant],
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {active && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-red"
            style={{ animation: "mic-pulse 1.6s ease-out infinite" }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-red"
            style={{ animation: "mic-pulse 1.6s ease-out infinite", animationDelay: "0.8s" }}
          />
        </>
      )}
      <Mic size={iconSizes[size]} />
    </button>
  );
}
