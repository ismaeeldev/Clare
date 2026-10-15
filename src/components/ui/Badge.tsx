import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge — status pill, per docs/02_ThemeGuideline.md §6.6.
 * radius-full, 4px 10px padding, label type token, colored per the semantic
 * mapping in §2.3 (e.g. "Confirmed" = green-soft, "Pending" = amber-soft,
 * "Suggestion" = gold-soft).
 */
export type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "suggestion";

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-green-soft text-green-text",
  warning: "bg-amber-soft text-amber-text",
  error: "bg-red-soft text-red-text",
  info: "bg-purple-soft text-purple-text",
  suggestion: "bg-gold-soft text-gold-text",
  neutral: "bg-bg-dark text-text-mid",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-label font-bold uppercase tracking-[0.06em]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
