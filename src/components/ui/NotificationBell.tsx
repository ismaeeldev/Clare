import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
  variant?: "light" | "dark";
  className?: string;
}

/**
 * NotificationBell — High-contrast luxury notification bell button
 */
export function NotificationBell({
  unreadCount,
  onClick,
  variant = "light",
  className,
}: NotificationBellProps) {
  const isDark = variant === "dark";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : "Notifications"}
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 cursor-pointer active:scale-95 touch-manipulation",
        isDark
          ? "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.16] hover:border-white/30"
          : "border border-border/80 bg-white text-navy hover:bg-slate-50 hover:border-gold/40 shadow-xs",
        className
      )}
    >
      <Bell 
        size={19} 
        strokeWidth={2.2} 
        className={isDark ? "text-white" : "text-navy"} 
      />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-solid px-1 text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
