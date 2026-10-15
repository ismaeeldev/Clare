import { AlertCircle } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

/**
 * InlineError — Step 1.2.5 primitive, per docs/04_ApplicationFlow.md §3
 * "Error (recoverable)" row: a small, friendly, in-context error with a
 * Retry button, meant to be dropped into any section of a screen without
 * blanking the rest of the page (NFR-05 — never a blank crash screen).
 */
export interface InlineErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({
  message = "Une erreur est survenue.",
  onRetry,
  className,
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-lg bg-red-soft px-4 py-3 text-body-sm text-red-text",
        className
      )}
    >
      <AlertCircle size={18} className="shrink-0" strokeWidth={2} />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <Button variant="destructive" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
