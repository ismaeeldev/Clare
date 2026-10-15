import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntitlement } from "@/hooks/useEntitlement";
import { NAV_ITEMS } from "./navItems";

export interface NavProps {
  activeKey: string;
  onNavigate: (href: string, key: string) => void;
  className?: string;
}

/**
 * BottomTabNav — Lavish mobile tab bar
 * Features:
 * - Ultra-frosted glassmorphic backdrop
 * - Animated gold active indicator pill
 * - Tactile press feedback
 * - Safe-area inset ergonomics for iOS & mobile devices
 */
export function BottomTabNav({ activeKey, onNavigate, className }: NavProps) {
  // Same reasoning as SideNavRail's chat lock badge — only the Chat tab
  // leads straight to a fully-locked screen, every other tab stays
  // reachable regardless of plan.
  const { entitled } = useEntitlement();
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/[0.1] bg-navy/95 backdrop-blur-2xl shadow-[0_-8px_30px_rgba(18,22,46,0.3)] lg:hidden",
        "pb-[max(8px,env(safe-area-inset-bottom))]",
        className
      )}
      aria-label="Navigation principale"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.href, item.key)}
            aria-current={isActive ? "page" : undefined}
            className="relative flex min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-white/60 transition-colors duration-180 hover:text-white"
          >
            {isActive && (
              <motion.div
                layoutId="bottom-tab-active-indicator"
                className="absolute -top-px left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full bg-gold shadow-[0_0_10px_rgba(201,168,76,0.8)]"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <div className={cn(
              "relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
              isActive && "bg-white/[0.08] text-gold"
            )}>
              <Icon
                size={20}
                className={cn("transition-transform duration-200", isActive ? "text-gold scale-105" : "text-white/65")}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {item.key === "chat" && !entitled && (
                <Lock size={9} className="absolute -right-0.5 -top-0.5 rounded-full bg-navy text-gold/90" aria-hidden="true" />
              )}
            </div>
            <span
              className={cn(
                "text-[10px] tracking-tight transition-all duration-180",
                isActive ? "font-bold text-white" : "font-medium text-white/50"
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
