import { forwardRef } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Button — per docs/02_ThemeGuideline.md §6.1.
 * Variants: primary, accent, secondary (ghost), destructive, icon.
 * All buttons: transition all 0.18s ease, active:scale(0.97) press feedback,
 * disabled = 40% opacity + no pointer events.
 */

export type ButtonVariant = "primary" | "accent" | "secondary" | "destructive" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

// primary/accent (the two "solid CTA" variants) get a subtle shadow-raised
// elevation — found missing during a modernization pass: every other
// filled surface in the app (Card's default, BottomTabNav) already uses
// this token, but Button's own filled variants stayed flat, reading less
// premium next to them. secondary/destructive/icon stay flat on purpose —
// they're lower-emphasis actions, an elevated ghost/icon button would look
// wrong.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white shadow-raised hover:bg-navy-800 hover:shadow-floating",
  accent: "bg-gold text-navy shadow-raised hover:bg-gold-700 hover:shadow-floating",
  secondary: "bg-transparent text-navy border-[1.5px] border-navy/15 hover:bg-bg-dark",
  destructive: "bg-red-soft text-red-text hover:bg-red-solid hover:text-white",
  icon: "bg-transparent text-navy hover:bg-bg-dark",
};

// Same size scale for every non-icon variant — §6.1 doesn't vary size by
// variant, only by the size prop, so this is intentionally one shared table
// rather than duplicated per-variant (per 08_CodingStandards.md reuse rule).
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[12px]",
  md: "h-11 px-4 text-[13px]",
  lg: "h-11 px-5 text-[15px]",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth, className, children, disabled, ...props }, ref) => {
    const isIcon = variant === "icon";

    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          // §6.1: "transition: all 0.18s ease" — plain CSS ease, not Tailwind's
          // default cubic-bezier timing function, so ease-linear is overridden
          // via an arbitrary value to match the spec exactly.
          "inline-flex items-center justify-center gap-2 rounded-md font-ui font-bold cursor-pointer transition-all duration-180 ease-[ease]",
          "disabled:opacity-40 disabled:pointer-events-none",
          // No variant had a visible keyboard-focus indicator anywhere in
          // the app (confirmed: no focus-visible/ring token existed in
          // this file) — fails WCAG 2.4.7 for keyboard users. outline-none
          // only suppresses the default square browser outline in favor
          // of this rounded ring, it's not removing focus feedback.
          "outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
          variantClasses[variant],
          isIcon ? "h-10 w-10 rounded-full" : sizeClasses[size],
          fullWidth && !isIcon && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
Button.displayName = "Button";
