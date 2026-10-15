import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Flame,
  Moon,
  Sparkles,
  Zap,
  AlertTriangle,
  Clock,
  Compass
} from "lucide-react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { STAGGER_CONTAINER, STAGGER_ITEM } from "@/lib/motionVariants";
import { StatTile } from "@/components/ui/StatTile";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { getMorningEvening, todayFr, todayKey } from "@/lib/dateUtils";
import { PreparedPanel } from "./PreparedPanel";
import type { HomeProps } from "./types";

/**
 * HomeSkeleton — Sleek loading placeholder
 */
function HomeSkeleton() {
  return (
    <div className="pb-24 lg:pb-8" role="status" aria-label="Chargement de l'accueil">
      {/* Header Skeleton */}
      <div className="border-b border-border/80 bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <SkeletonBlock width={100} height={12} radius="full" className="mb-1.5" />
            <SkeletonBlock width={220} height={26} radius="md" />
          </div>
          <div className="flex items-center gap-3">
            <SkeletonBlock width={38} height={38} radius="xl" />
            <SkeletonBlock width={38} height={38} radius="xl" />
          </div>
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="px-5 pt-6 sm:px-6 lg:mx-auto lg:max-w-[1240px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} height={88} radius="xl" />
          ))}
        </div>
      </div>

      {/* Main Grid Skeleton */}
      <div className="px-5 py-6 sm:px-6 lg:mx-auto lg:max-w-[1240px]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <SkeletonBlock height={80} radius="xl" />
            <SkeletonBlock height={180} radius="xl" />
            <SkeletonBlock height={140} radius="xl" />
          </div>
          <div className="flex flex-col gap-5 lg:col-span-5">
            <SkeletonBlock height={110} radius="xl" />
            <SkeletonBlock height={160} radius="xl" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} height={74} radius="xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HomeScreen — Sleek modern luxury dashboard
 */
export function HomeScreen({
  profile,
  journal,
  agenda,
  finances,
  dernierBrief,
  streak = 0,
  preparedProposals = [],
  loadingPrepared = false,
  preparedBusyIds = new Set(),
  preparedErrors = {},
  onConfirmPrepared,
  unreadNotifications = 0,
  onOpenNotifications,
  onNav,
  onChat,
  loading = false,
  entitled = false,
  entitlementLoading = false,
}: HomeProps) {
  const now = useMemo(() => new Date(), []);
  const { salut, emoji, mode } = getMorningEvening();

  const last7 = journal.slice(0, 7);
  const sportCount = last7.filter((j) => j.sport === "oui").length;
  const avgEnergie = last7.length
    ? (last7.reduce((s, j) => s + (j.energie || 3), 0) / last7.length).toFixed(1)
    : "-";
  const todayAgenda = agenda
    .filter((e) => e.date === todayKey())
    .sort((a, b) => a.heure.localeCompare(b.heure));
  const moisCA = finances?.revenus || 0;
  const objectifCA = parseInt(String(profile?.objectifCA)) || 0;
  const joursEcoules = finances?.joursEcoules || now.getDate();
  const joursDansMois = finances?.joursDansMois || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const rythmeAttendu = objectifCA ? Math.round((objectifCA / joursDansMois) * joursEcoules) : 0;
  const enAvance = moisCA >= rythmeAttendu;
  const isDimanche = now.getDay() === 0;
  const isSoir = mode === "soir";
  const briefDate = dernierBrief?.date;
  const joursSansBrief = briefDate
    ? Math.floor((now.getTime() - new Date(briefDate).getTime()) / 86400000)
    : 99;

  const nuitsDifficiles = last7.filter((j) => (j.energie ?? 3) <= 2 || (j.humeur ?? 3) <= 2).length;
  const fatigue = nuitsDifficiles >= 3 ? "critique" : nuitsDifficiles >= 2 ? "elevée" : "normale";

  const briefings: Record<string, string> = {
    matin: `${emoji} ${salut} ${profile?.prenom || ""} — ${
      todayAgenda.length
        ? `${todayAgenda.length} engagement${todayAgenda.length > 1 ? "s" : ""} prévu${todayAgenda.length > 1 ? "s" : ""} aujourd'hui.`
        : "Votre journée est totalement dégagée."
    } Comment vous sentez-vous ce matin ?`,
    aprem: `${emoji} ${salut} ${profile?.prenom || ""} — La matinée est bouclée. Voyons ensemble ce qui mérite votre attention pour cet après-midi.`,
    soir: `${emoji} ${salut} ${profile?.prenom || ""} — Fin de journée. Déposez tout ce qui vous préoccupe : je m'occupe de le classer et de préparer demain.`,
  };

  const jourAuj = dernierBrief?.data?.jours?.find((j) => j.date === todayKey());
  const prepHighlighted = isDimanche || joursSansBrief > 6;

  if (loading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="pb-24 lg:pb-8">
      {/* 1. Sleek Modern Top Bar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-white/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">
                {todayFr()}
              </span>
              <span className="text-text-muted">•</span>
              <span className="text-[11px] font-semibold text-meta">Espace Claré</span>
            </div>
            <h1 className="font-display text-[22px] font-extrabold text-navy tracking-tight sm:text-[26px]">
              {salut}, {profile?.prenom || "Bienvenue"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {!entitlementLoading && !entitled && (
              <Link
                to="/billing"
                className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gradient-to-r from-gold/15 to-transparent px-3.5 py-1.5 text-[12px] font-bold text-gold-text transition-all hover:border-gold hover:bg-gold/25"
              >
                <Crown size={13} />
                <span className="hidden sm:inline">Passer en Premium</span>
                <span className="sm:hidden">Premium</span>
              </Link>
            )}
            {onOpenNotifications && (
              <NotificationBell unreadCount={unreadNotifications} onClick={onOpenNotifications} />
            )}
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold via-gold-500 to-gold-700 text-sm font-extrabold text-navy shadow-gold-glow">
              {(profile?.prenom || "C")[0]?.toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Metrics Band */}
      <div className="px-5 pt-6 sm:px-6 lg:mx-auto lg:max-w-[1240px]">
        <motion.div
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
        >
          <motion.div variants={STAGGER_ITEM}>
            <StatTile 
              icon="🏃" 
              value={`${sportCount}/7`} 
              label="Séances sport" 
              valueColor="green" 
              trend={sportCount >= 3 ? "Objectif atteint" : "En cours"} 
            />
          </motion.div>
          <motion.div variants={STAGGER_ITEM}>
            <StatTile 
              icon="⚡" 
              value={`${avgEnergie}/5`} 
              label="Niveau d'énergie" 
              valueColor="gold" 
              trend={Number(avgEnergie) >= 3.5 ? "Forme optimale" : "Récupération"} 
            />
          </motion.div>
          <motion.div variants={STAGGER_ITEM}>
            <StatTile 
              icon="💶" 
              value={`${finances?.depenses || 0} €`} 
              label="Dépenses du mois" 
              valueColor="navy" 
            />
          </motion.div>
          <motion.div variants={STAGGER_ITEM}>
            <div className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-white p-3.5 shadow-[0_2px_8px_rgba(26,31,60,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised">
              <div className="flex items-center justify-between">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-soft text-gold-text text-sm">
                  💰
                </div>
                <span className={`text-[10px] font-bold ${enAvance ? "text-green-text" : "text-amber-text"}`}>
                  {enAvance ? "En avance" : "En cours"}
                </span>
              </div>
              <div className="mt-1">
                <div className="font-ui text-[15px] font-extrabold tabular-nums tracking-tight text-navy">
                  {moisCA} €
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-meta">
                  Objectif CA : {objectifCA || 0} €
                </div>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-dark">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${enAvance ? "bg-green" : "bg-gold"}`}
                  style={{ width: `${Math.min(100, (moisCA / (objectifCA || 1)) * 100)}%` }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* 3. Main Two-Column Balanced Grid */}
      <div className="px-5 py-6 sm:px-6 lg:mx-auto lg:max-w-[1240px]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
          
          {/* Left Column (Briefing, Suggestions, Planning & Agenda) */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            
            {/* Claré AI Briefing Card */}
            <button
              type="button"
              onClick={() => onChat(briefings[mode])}
              className="group relative w-full overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-navy via-navy to-navy-900 p-5 text-left text-white shadow-floating transition-all duration-200 hover:border-gold/60 hover:shadow-modal cursor-pointer"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold/20 text-gold">
                    <Sparkles size={13} />
                  </div>
                  <span className="text-[11px] font-bold tracking-wider uppercase text-gold">
                    BRIEFING DU JOUR · CLARÉ AI
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold transition-transform group-hover:translate-x-0.5">
                  <span>Échanger</span>
                  <ChevronRight size={13} />
                </span>
              </div>
              <p className="text-body-sm text-white/95 leading-relaxed font-normal">
                {briefings[mode]}
              </p>
            </button>

            {/* Weekly Prep Banner */}
            <button
              type="button"
              onClick={() => onNav("prep")}
              className={
                prepHighlighted
                  ? "group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-gold/40 bg-[linear-gradient(135deg,#e5cb7b_0%,#c9a84c_50%,#9e7e2c_100%)] p-4.5 text-left text-navy shadow-gold-glow transition-all duration-200 hover:shadow-floating hover:-translate-y-0.5 cursor-pointer"
                  : "group flex w-full items-center gap-4 rounded-2xl border border-border/90 bg-white p-4.5 text-left shadow-[0_2px_8px_rgba(26,31,60,0.03)] transition-all duration-200 hover:border-gold/40 hover:bg-bg-dark/60 hover:shadow-raised cursor-pointer"
              }
            >
              <div
                className={
                  prepHighlighted
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy text-2xl text-gold shadow-md"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-2xl text-gold-text shadow-sm"
                }
              >
                🗓️
              </div>
              <div className="flex-1">
                <p className="font-display text-[15px] font-extrabold text-navy">
                  {dernierBrief ? "Préparer ma prochaine semaine" : "Préparer ma première semaine"}
                </p>
                <p className="mt-0.5 text-[12px] text-meta font-medium">
                  {dernierBrief
                    ? `Dernier brief validé : ${joursSansBrief === 0 ? "aujourd'hui" : `il y a ${joursSansBrief}j`}`
                    : "3 minutes pour orchestrer toute votre semaine"}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-meta transition-transform group-hover:translate-x-1">
                <ChevronRight size={18} />
              </div>
            </button>

            {/* Claré Prepared AI Proposals with Markdown Support */}
            <PreparedPanel
              proposals={preparedProposals}
              loading={loadingPrepared}
              busyIds={preparedBusyIds}
              errors={preparedErrors}
              onConfirm={(proposal) => onConfirmPrepared?.(proposal)}
            />

            {/* Daily Auto-Adjusted Briefing Card */}
            {dernierBrief?.data && (
              <div
                onClick={() => onNav("prep")}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gold/30 bg-[linear-gradient(145deg,var(--color-navy)_0%,var(--navy-950)_100%)] p-5 text-white shadow-floating transition-all duration-200 hover:border-gold/50 hover:shadow-modal"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold/20 text-gold text-xs">
                      ◈
                    </span>
                    <span className="text-label font-bold uppercase tracking-wider text-gold">
                      PLAN DU JOUR · AUTO-RÉGLÉ
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-white/60 group-hover:text-gold transition-colors">
                    Brief complet →
                  </span>
                </div>

                {jourAuj ? (
                  <div className="space-y-3">
                    {jourAuj.ajuste && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold">
                        <span>🔄 Ajusté en temps réel selon vos saisies</span>
                      </div>
                    )}
                    {jourAuj.ajustement && (
                      <p className="text-body-sm font-semibold text-white leading-relaxed">
                        {jourAuj.ajustement}
                      </p>
                    )}
                    {jourAuj.alerte && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber/30 bg-amber-soft/20 px-3 py-1.5 text-body-sm font-bold text-amber">
                        <AlertTriangle size={15} />
                        <span>{jourAuj.alerte}</span>
                      </div>
                    )}
                    {jourAuj.conseil && (
                      <p className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-body-sm text-white/90 leading-relaxed">
                        💡 {jourAuj.conseil}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white">
                        <span>🍽️ Déjeuner :</span>
                        <span className="font-semibold text-gold">{jourAuj.repasMidi}</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white">
                        <span>🌙 Dîner :</span>
                        <span className="font-semibold text-gold">{jourAuj.repasSoir}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-body-sm text-white/80">
                    Aucun plan spécifique pour aujourd'hui — cliquer pour voir le brief complet →
                  </p>
                )}
              </div>
            )}

            {/* Today's Agenda Timeline */}
            {todayAgenda.length > 0 && (
              <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_4px_20px_rgba(26,31,60,0.04)]">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-label font-bold uppercase tracking-wider text-navy flex items-center gap-2">
                    <Clock size={15} className="text-gold" />
                    AGENDA DU JOUR
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNav("agenda")}
                    className="text-label font-bold text-gold-text transition-opacity hover:opacity-75 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Voir tout</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-2.5">
                  {todayAgenda.slice(0, 4).map((ev) => (
                    <div
                      key={ev.id}
                      className="group flex items-center gap-3.5 rounded-xl border border-border/60 bg-bg/40 p-3.5 transition-all hover:bg-white hover:border-gold/30 hover:shadow-sm"
                    >
                      <div className="min-w-[52px] text-center">
                        <div className="text-body-sm font-extrabold text-navy tabular-nums">{ev.heure}</div>
                        {ev.duree && <div className="text-[10px] font-semibold text-meta">{ev.duree}</div>}
                      </div>
                      <div className="h-7 w-px bg-border" />
                      <TypeDot type={ev.type} />
                      <p className="flex-1 text-body-sm font-bold text-text truncate">{ev.titre}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Assistant, Actions Rapides & Grille 2x3 des Raccourcis) */}
          <div className="flex flex-col gap-6 lg:col-span-5 lg:sticky lg:top-24 self-start">
            
            {/* Fatigue Warning Alert */}
            {fatigue !== "normale" && (
              <div
                className={`flex gap-3.5 rounded-2xl p-4.5 shadow-sm ${
                  fatigue === "critique" ? "border border-red/30 bg-red-soft" : "border border-amber/30 bg-amber-soft"
                }`}
              >
                <div className="shrink-0 text-2xl">{fatigue === "critique" ? "🚨" : "⚠️"}</div>
                <div>
                  <p className={`mb-0.5 text-body-sm font-bold ${fatigue === "critique" ? "text-red-text" : "text-amber-text"}`}>
                    Vigilance : Fatigue {fatigue === "critique" ? "critique" : "élevée"}
                  </p>
                  <p className="text-[12px] text-text-mid leading-relaxed">
                    {nuitsDifficiles} journées à faible énergie sur 7 — Claré vous conseille d'alléger vos obligations.
                  </p>
                </div>
              </div>
            )}

            {/* Sunday Streak */}
            {streak > 0 && (
              <div className="flex items-center gap-3.5 rounded-2xl border border-gold/30 bg-gradient-to-r from-gold-soft via-white to-gold-soft/30 p-4.5 shadow-[0_2px_12px_rgba(201,168,76,0.08)]">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold text-navy shadow-sm">
                  <Flame size={22} />
                </div>
                <div>
                  <p className="font-display text-body-sm font-extrabold text-navy">
                    Série active : {streak} dimanche{streak > 1 ? "s" : ""} consécutif{streak > 1 ? "s" : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-meta">
                    Votre régularité est le socle de votre clarté d'esprit.
                  </p>
                </div>
              </div>
            )}

            {/* Evening Mind Dump / Assistant Launcher */}
            {isSoir ? (
              <button
                type="button"
                onClick={() => onChat("Je veux vider ma tête.")}
                className="group flex w-full items-center gap-4 rounded-2xl border border-gold/30 bg-[linear-gradient(135deg,#12162e_0%,#1a1f3c_100%)] p-5 text-left shadow-floating transition-all duration-200 hover:-translate-y-1 hover:shadow-modal cursor-pointer"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/20 text-gold text-2xl shadow-sm">
                  <Moon size={24} />
                </div>
                <div className="flex-1">
                  <p className="font-display text-heading font-extrabold text-white">Vide-tête du soir</p>
                  <p className="mt-1 text-[12px] text-gold/90 leading-snug">
                    Déposez tout ce qui tourne dans votre esprit. Claré structure et organise tout.
                  </p>
                </div>
                <ArrowRight size={18} className="text-gold transition-transform group-hover:translate-x-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNav("chat")}
                className="group flex w-full items-center gap-4 rounded-2xl border border-navy/20 bg-navy p-5 text-left text-white shadow-raised transition-all duration-200 hover:bg-navy-800 hover:shadow-floating hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold to-gold-700 text-lg font-black text-navy shadow-gold-glow">
                  ◈
                </div>
                <div className="flex-1">
                  <p className="font-display text-body-sm font-extrabold">Échanger avec Claré</p>
                  <p className="mt-0.5 text-[12px] text-white/70">Conseils, ajustements, idées et organisation</p>
                </div>
                <ChevronRight size={18} className="text-white/60 transition-transform group-hover:translate-x-1" />
              </button>
            )}

            {/* Contextual Quick Actions */}
            <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_4px_20px_rgba(26,31,60,0.04)]">
              <p className="mb-3 text-label font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <Zap size={15} className="text-gold" />
                ACTIONS RAPIDES
              </p>
              <div className="flex flex-col gap-2.5">
                {[
                  { msg: "Qu'est-ce que je mange ce soir ?", icon: "🍽️", label: "Idée repas maintenant" },
                  { msg: "Montre-moi les projets que j'ai négligés.", icon: "🪞", label: "Miroir projets & focus" },
                  { msg: "Je veux faire du sport, tu me proposes quoi ?", icon: "🏃", label: "Séance sport recommandée" },
                ].map(({ msg, icon, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onChat(msg)}
                    className="group flex items-center gap-3 rounded-xl border border-border/60 bg-bg/40 p-3 text-left transition-all hover:bg-white hover:border-gold/30 hover:shadow-sm cursor-pointer"
                  >
                    <span className="shrink-0 text-lg">{icon}</span>
                    <span className="text-body-sm font-semibold text-navy flex-1">{label}</span>
                    <ChevronRight size={16} className="text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Harmonious 2x3 Modules & Shortcuts Grid */}
            <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-[0_4px_20px_rgba(26,31,60,0.04)]">
              <p className="mb-3.5 text-label font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                <Compass size={15} className="text-gold" />
                MODULES & ESPACES
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: "📓", label: "Journal", nav: "journal", color: "text-navy", sub: "Ma journée" },
                  { icon: "🎯", label: "Focus", nav: "focus", color: "text-purple-text", sub: "Mode profond" },
                  { icon: "🍽️", label: "Nutrition", nav: "nutrition", color: "text-green-text", sub: "Mes repas" },
                  { icon: "📊", label: "Bilan", nav: "stats", color: "text-gold-text", sub: "Ma semaine" },
                  { icon: "🏃", label: "Workout", nav: "workout", color: "text-green-text", sub: "Séance live" },
                  { icon: "💡", label: "Idées", nav: "idees", color: "text-amber-text", sub: "Projets & notes" },
                ].map(({ icon, label, nav, color, sub }) => (
                  <button
                    key={nav}
                    type="button"
                    onClick={() => onNav(nav)}
                    className="group flex items-center gap-2.5 rounded-xl border border-border/60 bg-bg/40 p-3 text-left transition-all duration-200 hover:bg-white hover:border-gold/30 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs text-base transition-transform group-hover:scale-105">
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-display text-[13px] font-extrabold ${color}`}>{label}</p>
                      <p className="text-[10px] text-meta truncate">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TypeDot — Category indicator pill with theme colors
 */
function TypeDot({ type }: { type: string }) {
  const map: Record<string, string> = {
    rdv: "bg-navy",
    sport: "bg-green",
    perso: "bg-amber",
    déplacement: "bg-gold",
    focus: "bg-purple",
  };
  return <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${map[type] || "bg-text-light"}`} />;
}
