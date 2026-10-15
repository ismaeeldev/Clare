import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * Card — per docs/02_ThemeGuideline.md §6.2.
 * Base: white bg, radius-lg (14px), raised elevation, 16-20px padding.
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: "flat" | "raised" | "floating" | "modal";
}

const elevationClasses = {
  flat: "shadow-flat border border-border",
  raised: "shadow-raised",
  floating: "shadow-floating",
  modal: "shadow-modal",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ elevation = "raised", className, children, onClick, onKeyDown, ...props }, ref) => {
    // A Card given onClick becomes a real interactive element (this
    // project already has several onClick-only Cards, e.g. HomeScreen's
    // dernierBrief card and this session's new Settings navigation
    // cards) — without role/tabIndex/Enter-Space handling, none of those
    // were reachable or activatable by keyboard at all. Adding this once
    // here, rather than to each call site, fixes every existing and
    // future clickable Card in the app at once.
    const isInteractive = typeof onClick === "function";
    return (
      <div
        ref={ref}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
                }
                onKeyDown?.(e);
              }
            : onKeyDown
        }
        className={cn(
          "rounded-lg bg-white p-4 md:p-5",
          elevationClasses[elevation],
          // Hover/active feedback for interactive Cards only — found
          // missing during a Step 1-8 UI-polish pass: Card handled
          // keyboard reachability (role/tabIndex/Enter-Space) for its
          // onClick variant but gave zero visual response on desktop
          // hover, unlike every Button variant which already bakes this
          // in centrally. Kept subtle (a faint lift, not a color change)
          // since Card's background/border varies per call site.
          isInteractive && "transition-[transform,box-shadow] duration-180 ease-[ease] hover:-translate-y-px hover:shadow-floating active:translate-y-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

/**
 * ContextualActionCard — the Home-screen card pattern from §6.2:
 * white bg, left-accent 3px bar in category color, icon + title (heading) +
 * one-line description (body-sm, text-mid) + single CTA button.
 */
export type ContextualCardAccent = "gold" | "green" | "amber" | "purple" | "red";

const accentBarClasses: Record<ContextualCardAccent, string> = {
  gold: "before:bg-gold",
  green: "before:bg-green",
  amber: "before:bg-amber",
  purple: "before:bg-purple",
  red: "before:bg-red",
};

export interface ContextualActionCardProps {
  accent: ContextualCardAccent;
  icon?: ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  onCtaClick?: () => void;
  className?: string;
}

export function ContextualActionCard({
  accent,
  icon,
  title,
  description,
  ctaLabel,
  onCtaClick,
  className,
}: ContextualActionCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-[3px]",
        accentBarClasses[accent],
        className
      )}
    >
      <div className="flex items-start gap-3">
        {icon && <div className="shrink-0 text-xl">{icon}</div>}
        <div className="min-w-0 flex-1">
          <h3 className="text-heading font-bold text-navy">{title}</h3>
          <p className="mt-1 text-body-sm text-text-mid">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end sm:justify-end">
        <Button variant="accent" size="sm" onClick={onCtaClick} className="w-full sm:w-auto">
          {ctaLabel}
        </Button>
      </div>
    </Card>
  );
}
