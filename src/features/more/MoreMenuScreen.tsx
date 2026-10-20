import { useNavigate } from "react-router-dom";
import {
  Target,
  Utensils,
  BarChart3,
  Dumbbell,
  Lightbulb,
  Bell,
  ListChecks,
  MapPin,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface MenuTile {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  color: "navy" | "gold" | "green" | "red" | "amber" | "purple";
}

const tileColorClasses: Record<MenuTile["color"], string> = {
  navy: "bg-navy-100 text-navy",
  gold: "bg-gold-soft text-gold-text",
  green: "bg-green-soft text-green-text",
  red: "bg-red-soft text-red-text",
  amber: "bg-amber-soft text-amber-text",
  purple: "bg-purple-soft text-purple-text",
};

// Every destination here previously had NO entry point on mobile — the
// 5-item bottom tab bar (Home/Chat/Agenda/Journal/Plus) only routed "Plus"
// straight to /settings, and /settings itself only linked to Profil/
// Facturation/Historique/Routine/Lieux. A client report ("mobile sidebar
// links incomplete") confirmed these 6 screens were simply unreachable on
// mobile despite being real, unlocked, ProtectedRoute-only features. This
// screen is the mobile nav hub that closes that gap — Home/Chat/Agenda/
// Journal keep their own tab, everything else lives here, one tap away.
const MENU_TILES: MenuTile[] = [
  { key: "focus", label: "Mode focus", desc: "Sessions concentrées", href: "/focus", icon: Target, color: "purple" },
  { key: "nutrition", label: "Nutrition & Repas", desc: "Plans et courses", href: "/nutrition", icon: Utensils, color: "amber" },
  { key: "stats", label: "Bilan & Métriques", desc: "Ta progression", href: "/stats", icon: BarChart3, color: "green" },
  { key: "workout", label: "Séance live", desc: "Entraînement guidé", href: "/workout", icon: Dumbbell, color: "red" },
  { key: "idees", label: "Idées & Projets", desc: "Ton vide-tête", href: "/idees", icon: Lightbulb, color: "gold" },
  { key: "notifications", label: "Notifications", desc: "Rappels de Claré", href: "/notifications", icon: Bell, color: "navy" },
  { key: "routine", label: "Routine & Habitudes", desc: "Tâches du foyer", href: "/routine", icon: ListChecks, color: "purple" },
  { key: "lieux", label: "Mes lieux récurrents", desc: "Trajets habituels", href: "/lieux", icon: MapPin, color: "green" },
];

export function MoreMenuScreen() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    // Same supabase.auth.signOut() + navigate("/sign-in") path as
    // AppShell's onLogout (desktop SideNavRail) and SettingsRoute's
    // handleSignOut — this is the third of three trigger points for the
    // one sign-out implementation, same reuse discipline those two
    // already document.
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signOut();
    navigate("/sign-in");
  };

  return (
    <div className="pb-24 lg:pb-8 font-ui">
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto max-w-[1240px]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
            Navigation
          </span>
          <h1 className="font-display text-[20px] font-extrabold text-navy tracking-tight sm:text-[24px]">
            Plus d'options
          </h1>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 py-6 sm:px-6">
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-meta">
            Organisation & Suivi
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MENU_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <Card
                  key={tile.key}
                  onClick={() => navigate(tile.href)}
                  className="group flex cursor-pointer flex-col items-start gap-2.5 rounded-2xl border border-border/80 bg-white p-4 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-raised"
                >
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105", tileColorClasses[tile.color])}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-navy">{tile.label}</p>
                    <p className="mt-0.5 text-[11px] text-meta">{tile.desc}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-meta">
            Compte
          </h2>
          <div className="flex flex-col gap-2.5">
            <Card
              onClick={() => navigate("/settings")}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-navy/20 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <Settings className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">Réglages & Compte</p>
                    <p className="text-[11px] text-meta">Profil, abonnement, préférences</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
              </div>
            </Card>

            <Card
              onClick={handleLogout}
              className="group cursor-pointer rounded-2xl border border-border/80 bg-white p-4.5 shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-red/30 hover:shadow-[0_4px_14px_rgba(26,31,60,0.06)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-soft text-red-text">
                  <LogOut className="h-4 w-4" />
                </div>
                <p className="text-xs font-bold text-navy">Se déconnecter</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
