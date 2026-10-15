import type { PreparedProposal } from "./PreparedPanel";

/**
 * Home screen data shapes — extracted from App.jsx's Home component props
 * (line 807: profile, journal, agenda, finances, onNav, onChat, dernierBrief,
 * streak). Real Supabase-backed data now wired in HomeRoute.tsx (Step 6's
 * adversarial-review fix — this was still Step 1.3 placeholder data until
 * then). `preparedProposals`/`loadingPrepared`/`onDismissPrepared` are
 * Step 6's "Claré has prepared" panel (registry §2.7).
 */
export interface JournalEntry {
  date: string;
  sport: "oui" | "non" | "léger" | string;
  energie?: number;
  humeur?: number;
}

export interface AgendaItem {
  id: string;
  date: string;
  heure: string;
  duree?: string;
  titre: string;
  type: "rdv" | "sport" | "perso" | "déplacement" | "focus" | string;
}

export interface Finances {
  revenus?: number;
  depenses?: number;
  joursEcoules?: number;
  joursDansMois?: number;
}

export interface BriefJour {
  date: string;
  ajuste?: boolean;
  ajustement?: string;
  alerte?: string;
  conseil?: string;
  repasMidi?: string;
  repasSoir?: string;
}

export interface DernierBrief {
  date: string;
  data?: { jours?: BriefJour[] };
}

export interface Profile {
  prenom?: string;
  objectifCA?: string | number;
}

export interface HomeProps {
  profile: Profile;
  journal: JournalEntry[];
  agenda: AgendaItem[];
  finances: Finances;
  dernierBrief?: DernierBrief;
  streak?: number;
  preparedProposals?: PreparedProposal[];
  loadingPrepared?: boolean;
  preparedBusyIds?: Set<string>;
  preparedErrors?: Record<string, string>;
  onConfirmPrepared?: (proposal: PreparedProposal) => void;
  unreadNotifications?: number;
  onOpenNotifications?: () => void;
  onNav: (target: string) => void;
  onChat: (message: string) => void;
  loading?: boolean;
  /** Entitlement state — passed down from HomeRoute's single useEntitlement() call rather than HomeScreen calling the hook again, which would fire a second redundant fetchSubscription request on every Home load. */
  entitled?: boolean;
  entitlementLoading?: boolean;
}
