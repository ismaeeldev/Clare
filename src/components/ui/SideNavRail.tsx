import { motion } from "framer-motion";
import {
  Sparkles,
  MessageSquarePlus,
  Settings,
  BookOpen,
  Target,
  Utensils,
  BarChart3,
  Dumbbell,
  Lightbulb,
  Home,
  Bell,
  LogOut,
  Lock,
  CalendarDays
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntitlement } from "@/hooks/useEntitlement";
import type { NavProps } from "./BottomTabNav";

interface SideNavRailProps extends NavProps {
  /** Signs the user out — desktop-only entry point (mobile reaches the
      same supabase.auth.signOut() via Settings, per 08_CodingStandards.md's
      reuse rule: one sign-out implementation, two places to trigger it). */
  onLogout?: () => void;
}

const DESKTOP_NAV_ITEMS = [
  { key: "home", label: "Tableau de bord", href: "/home", icon: Home },
  { key: "agenda", label: "Agenda", href: "/agenda", icon: CalendarDays },
  { key: "journal", label: "Journal quotidien", href: "/journal", icon: BookOpen },
  { key: "focus", label: "Mode focus", href: "/focus", icon: Target },
  { key: "nutrition", label: "Nutrition & Repas", href: "/nutrition", icon: Utensils },
  { key: "stats", label: "Bilan & Métriques", href: "/stats", icon: BarChart3 },
  { key: "workout", label: "Séance live", href: "/workout", icon: Dumbbell },
  { key: "idees", label: "Idées & Projets", href: "/idees", icon: Lightbulb },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: Bell },
];

/**
 * SideNavRail — Modern, fixed luxury sidebar for desktop (1024px+)
 * Fixed 260px width to prevent layout fluctuations on hover.
 */
export function SideNavRail({ activeKey, onNavigate, onLogout, className }: SideNavRailProps) {
  // Only used to show a small lock badge on the Chat CTA (the one nav
  // entry point that leads straight to a fully-locked PremiumRoute screen)
  // — every regular DESKTOP_NAV_ITEMS destination stays reachable
  // regardless of plan, since most screens mix free content with one
  // gated AI action rather than being entirely premium.
  const { entitled } = useEntitlement();
  return (
    <nav
      className={cn(
        "fixed top-0 bottom-0 left-0 z-30 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[linear-gradient(180deg,#12162e_0%,#1a1f3c_100%)] p-4 shadow-floating lg:flex",
        className
      )}
      aria-label="Navigation principale"
    >
      {/* Top Section */}
      <div className="flex flex-col gap-5">
        {/* Brand Header */}
        <div 
          onClick={() => onNavigate("/home", "home")}
          className="flex cursor-pointer items-center gap-3 px-2 py-1.5 transition-opacity hover:opacity-90"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold via-gold-500 to-gold-700 shadow-gold-glow">
            <span className="font-serif text-lg font-black text-navy">◈</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-extrabold tracking-tight text-white">
              Claré
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gold/90">
              Assistant Privé
            </span>
          </div>
        </div>

        {/* Quick Assistant CTA Button */}
        <button
          type="button"
          onClick={() => onNavigate("/chat", "chat")}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-r from-gold/15 to-transparent p-3 text-left transition-all duration-200 hover:border-gold hover:bg-gold/25 hover:shadow-gold-glow cursor-pointer"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold text-navy shadow-sm transition-transform duration-200 group-hover:scale-105">
            <MessageSquarePlus size={17} />
          </div>
          <div className="flex-1">
            <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-white">
              Échanger avec Claré
              {!entitled && <Lock size={11} className="shrink-0 text-gold/80" aria-hidden="true" />}
            </span>
            <span className="block text-[10px] font-medium text-gold/80">
              {entitled ? "Assistant disponible" : "Réservé aux membres Premium"}
            </span>
          </div>
        </button>

        {/* Navigation Section */}
        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
            Navigation
          </p>
          {DESKTOP_NAV_ITEMS.map((item) => {
            const isActive = item.key === activeKey;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.href, item.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all duration-180 cursor-pointer",
                  isActive
                    ? "bg-white/[0.12] text-white shadow-[0_2px_8px_rgba(0,0,0,0.2)] font-bold"
                    : "text-white/70 hover:bg-white/[0.06] hover:text-white font-medium"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="desktop-sidebar-active"
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gold shadow-[0_0_8px_rgba(201,168,76,0.8)]"
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <Icon
                  size={19}
                  className={cn(
                    "shrink-0 transition-colors duration-180",
                    isActive ? "text-gold" : "text-white/60"
                  )}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span className="text-[13px] tracking-tight truncate">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile & Settings */}
      <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-3">
        <button
          type="button"
          onClick={() => onNavigate("/settings", "settings")}
          className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-left text-white/65 transition-all hover:bg-white/[0.06] hover:text-white cursor-pointer"
        >
          <Settings size={18} className="shrink-0 text-white/60" />
          <span className="text-[13px] font-medium">
            Réglages & Compte
          </span>
        </button>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-left text-white/65 transition-all hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <LogOut size={18} className="shrink-0 text-white/60" />
            <span className="text-[13px] font-medium">
              Se déconnecter
            </span>
          </button>
        )}

        <div className="flex items-center justify-between rounded-xl bg-white/[0.05] p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-xs font-bold text-gold border border-gold/30">
              <span>◈</span>
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-navy bg-green" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[12px] font-bold text-white truncate">Espace Claré</span>
              <span className="text-[10px] text-gold/80 flex items-center gap-1">
                <Sparkles size={9} className="text-gold" />
                Sécurisé
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
