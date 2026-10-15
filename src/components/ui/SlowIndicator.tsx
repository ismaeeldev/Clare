import { cn } from "@/lib/utils";

/**
 * SlowIndicator — 04_ApplicationFlow.md §3's "Slow network" row: a request
 * taking longer than ~2-3s should show a subtle "still working..." signal,
 * distinct from the eventual timeout/error state — never a frozen-looking
 * screen. Paired with apiClient.ts's `onSlow` callback (fired once past
 * SLOW_THRESHOLD_MS) via each call site's own `slow` boolean state.
 */
export function SlowIndicator({ label = "Toujours en cours...", className }: { label?: string; className?: string }) {
  return (
    <p role="status" className={cn("flex items-center gap-1.5 text-body-sm text-text-light", className)}>
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-text-light" aria-hidden="true" />
      {label}
    </p>
  );
}
