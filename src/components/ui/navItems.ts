import { Home, MessageCircle, CalendarDays, BookOpen, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared nav item definitions for BottomTabNav (mobile) and SideNavRail
 * (desktop) — per docs/02_ThemeGuideline.md §6.4 and docs/04_ApplicationFlow.md
 * §1: five items, Home/Chat/Agenda/Journal/More, using Lucide icons.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Accueil", href: "/home", icon: Home },
  { key: "chat", label: "Chat", href: "/chat", icon: MessageCircle },
  { key: "agenda", label: "Agenda", href: "/agenda", icon: CalendarDays },
  { key: "journal", label: "Journal", href: "/journal", icon: BookOpen },
  { key: "more", label: "Plus", href: "/menu", icon: MoreHorizontal },
];
