import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatTileProps {
  icon?: ReactNode;
  value: string | number;
  label: string;
  valueColor?: "navy" | "gold" | "green" | "red" | "amber" | "purple";
  trend?: string;
  className?: string;
}

const colorStyles = {
  navy: {
    iconBg: "bg-navy-100 text-navy",
    border: "hover:border-navy/30",
  },
  gold: {
    iconBg: "bg-gold-soft text-gold-text",
    border: "hover:border-gold/40",
  },
  green: {
    iconBg: "bg-green-soft text-green-text",
    border: "hover:border-green/40",
  },
  red: {
    iconBg: "bg-red-soft text-red-text",
    border: "hover:border-red/40",
  },
  amber: {
    iconBg: "bg-amber-soft text-amber-text",
    border: "hover:border-amber/40",
  },
  purple: {
    iconBg: "bg-purple-soft text-purple-text",
    border: "hover:border-purple/40",
  },
};

/**
 * StatTile — Lavish metric tile with elevated micro-card styling and colored icon badges
 */
export function StatTile({
  icon,
  value,
  label,
  valueColor = "navy",
  trend,
  className,
}: StatTileProps) {
  const styles = colorStyles[valueColor] || colorStyles.navy;

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-xl border border-border/80 bg-white p-3.5 text-center shadow-[0_2px_8px_rgba(26,31,60,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised",
        styles.border,
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-base transition-transform duration-200 group-hover:scale-105",
            styles.iconBg
          )}
        >
          {icon}
        </div>
      )}
      <div
        className="font-ui text-[15px] font-extrabold tabular-nums tracking-tight text-navy"
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-meta">
        {label}
      </div>
      {trend && (
        <div className="mt-1 text-[9px] font-semibold text-green-text">
          {trend}
        </div>
      )}
    </div>
  );
}
