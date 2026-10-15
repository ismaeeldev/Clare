import { cn } from "@/lib/utils";

/**
 * Skeleton — Lavish loading-state primitive with multi-tone metallic/champagne shimmer.
 * Supports:
 * - variant: "light" (for light backgrounds) | "navy" (for navy/dark headers and cards)
 * - radius: "sm" | "md" | "lg" | "xl" | "full"
 * - count & custom dimensions
 */
export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: "sm" | "md" | "lg" | "xl" | "full";
  variant?: "light" | "navy";
  count?: number;
  className?: string;
}

const radiusClasses = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-2xl",
  full: "rounded-full",
};

export function SkeletonBlock({
  width,
  height = 16,
  radius = "md",
  variant = "light",
  className,
}: Omit<SkeletonProps, "count">) {
  const isNavy = variant === "navy";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden",
        isNavy
          ? "bg-navy-800/80 before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.8s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent"
          : "bg-bg-dark/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.8s_infinite] before:bg-gradient-to-r before:from-transparent before:via-gold/15 before:to-transparent",
        radiusClasses[radius],
        className
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : (width ?? "100%"),
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

export function Skeleton({ count = 1, className, ...props }: SkeletonProps) {
  const content =
    count === 1 ? (
      <SkeletonBlock className={className} {...props} />
    ) : (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonBlock key={i} className={className} {...props} />
        ))}
      </div>
    );

  return (
    <div role="status" aria-label="Chargement en cours" className="w-full">
      {content}
    </div>
  );
}

/**
 * CardSkeleton — Preset skeleton for luxury dashboard cards
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/80 bg-white p-5 shadow-raised", className)}>
      <div className="flex items-center justify-between mb-3">
        <SkeletonBlock width={120} height={14} radius="sm" />
        <SkeletonBlock width={40} height={14} radius="full" />
      </div>
      <SkeletonBlock width="90%" height={16} radius="sm" className="mb-2" />
      <SkeletonBlock width="65%" height={14} radius="sm" className="mb-4" />
      <div className="flex gap-2">
        <SkeletonBlock width={80} height={28} radius="md" />
        <SkeletonBlock width={60} height={28} radius="md" />
      </div>
    </div>
  );
}

/**
 * StatTileSkeleton — Preset skeleton for metric tiles
 */
export function StatTileSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center rounded-xl border border-border/60 bg-white p-3.5 shadow-raised">
          <SkeletonBlock width={24} height={24} radius="full" className="mb-2" />
          <SkeletonBlock width={48} height={18} radius="sm" className="mb-1" />
          <SkeletonBlock width={60} height={11} radius="sm" />
        </div>
      ))}
    </div>
  );
}
