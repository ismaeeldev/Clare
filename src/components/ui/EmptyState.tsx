import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

/**
 * EmptyState — Step 1.2.5 primitive, per docs/04_ApplicationFlow.md §3
 * "Empty" row: a reusable shell (icon + heading + description + optional
 * CTA) so empty states stay visually consistent even though copy differs
 * per screen. Every screen's SPECIFIC empty-state copy (per
 * docs/04_ApplicationFlow.md §2.x — e.g. "Aucun rendez-vous cette semaine"
 * for Agenda, "Aucune entrée pour l'instant" for Journal History) is
 * supplied by that screen, not hardcoded here.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** Disables the CTA button — e.g. while the action it triggers is already in flight, to prevent a double-submit. */
  ctaDisabled?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  onCtaClick,
  ctaDisabled,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="text-4xl text-text-light">
          {icon}
        </div>
      )}
      <h3 className="text-heading font-bold text-navy">{title}</h3>
      {description && (
        <p className="max-w-[40ch] text-body-sm text-meta">{description}</p>
      )}
      {ctaLabel && (
        <Button variant="accent" size="sm" onClick={onCtaClick} disabled={ctaDisabled} className="mt-2">
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
