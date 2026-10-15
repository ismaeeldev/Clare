import { cn } from "@/lib/utils";

export interface ChipProps {
  val: string;
  label: string;
  active: boolean;
  onClick: (val: string) => void;
  full?: boolean;
}

export function Chip({ val, label, active, onClick, full = false }: ChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(val)}
      className={cn(
        "rounded-xl px-4 py-3 text-left text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer active:scale-[0.99]",
        full && "w-full",
        active
          ? "bg-navy text-white shadow-sm border border-navy"
          : "bg-slate-50/80 text-navy border border-border/80 hover:bg-slate-100 hover:border-border"
      )}
    >
      {label}
    </button>
  );
}

