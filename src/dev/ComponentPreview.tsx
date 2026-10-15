import { useState } from "react";
import { Bell, Sparkles, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, ContextualActionCard } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { BottomTabNav } from "@/components/ui/BottomTabNav";
import { SideNavRail } from "@/components/ui/SideNavRail";
import { Skeleton } from "@/components/ui/Skeleton";
import { InlineError } from "@/components/ui/InlineError";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Temporary dev-only preview route (Steps 1.2 + 1.2.5) — renders every
 * variant of every component built so far for visual review against
 * docs/02_ThemeGuideline.md §6 and docs/04_ApplicationFlow.md §3. NOT wired
 * into the main app nav/router. Mounted via a `?dev=components` query param
 * check in main.jsx — replaced once Step 1.3 introduces real routing.
 */
export function ComponentPreview() {
  const [activeNav, setActiveNav] = useState("home");

  return (
    <div className="min-h-dvh bg-bg pb-24 lg:flex">
      <SideNavRail activeKey={activeNav} onNavigate={(_, key) => setActiveNav(key)} />

      <div className="flex-1 space-y-10 p-6 lg:p-10">
        <h1 className="text-display font-extrabold text-navy">Component Preview — Step 1.2</h1>
        <p className="max-w-[65ch] text-body text-text-mid">
          Every variant of every component built in Step 1.2, for visual review against
          docs/02_ThemeGuideline.md §6. This route is dev-only.
        </p>

        {/* Buttons */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">Button — §6.1</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="icon">
              <Bell size={18} />
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
          </div>
        </section>

        {/* Cards */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">Card — §6.2</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <p className="text-body text-text-mid">Base card (raised elevation)</p>
            </Card>
            <Card elevation="floating">
              <p className="text-body text-text-mid">Floating elevation</p>
            </Card>
            <Card elevation="flat">
              <p className="text-body text-text-mid">Flat (border only)</p>
            </Card>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ContextualActionCard
              accent="gold"
              icon={<Sparkles size={20} />}
              title="Prépare ta semaine"
              description="Ton brief est un peu ancien — on fait le point ?"
              ctaLabel="Préparer"
            />
            <ContextualActionCard
              accent="amber"
              title="Fatigue détectée"
              description="3 jours difficiles cette semaine."
              ctaLabel="Alléger"
            />
            <ContextualActionCard
              accent="green"
              title="Revenu — en avance"
              description="Tu es au-dessus de ton objectif du mois."
              ctaLabel="Voir"
            />
            <ContextualActionCard
              accent="purple"
              title="Séance prévue"
              description="Jambes — 45 min."
              ctaLabel="Démarrer"
            />
          </div>
        </section>

        {/* StatTile */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">StatTile — §6.2</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon="💰" value="2 340€" label="Revenu" valueColor="green" />
            <StatTile icon="🔥" value={7} label="Streak" valueColor="gold" />
            <StatTile icon="⚡" value="3/5" label="Énergie" valueColor="amber" />
            <StatTile icon="🏋️" value={4} label="Séances" valueColor="purple" />
          </div>
        </section>

        {/* Inputs */}
        <section className="max-w-md">
          <h2 className="text-display-sm font-bold text-navy">Input — §6.3</h2>
          <div className="mt-4 space-y-4">
            <Input label="Nom" placeholder="Ton nom" hint="Utilisé pour te saluer" />
            <Input label="Email" defaultValue="claire@example.com" helperText="Adresse de connexion" />
            <Input label="Mot de passe" type="password" error="Mot de passe trop court" />
          </div>
        </section>

        {/* Badges */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">Badge — §6.6</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="success">Confirmé</Badge>
            <Badge variant="warning">En attente</Badge>
            <Badge variant="error">Erreur</Badge>
            <Badge variant="suggestion">Suggestion</Badge>
            <Badge variant="info">Sport</Badge>
            <Badge variant="neutral">Neutre</Badge>
          </div>
        </section>

        <section>
          <h2 className="text-display-sm font-bold text-navy">Navigation — §6.4</h2>
          <p className="mt-2 text-body-sm text-text-light">
            Side rail is visible on the left (desktop, ≥1024px). Bottom tab nav is fixed at
            the bottom of the viewport (mobile). Active tab: <strong>{activeNav}</strong>
          </p>
        </section>

        {/* Skeleton — Step 1.2.5 */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">Skeleton — 1.2.5</h2>
          <div className="mt-4 max-w-md space-y-4">
            <Skeleton height={80} radius="lg" />
            <Skeleton count={3} height={14} />
            <div className="flex items-center gap-3">
              <Skeleton width={40} height={40} radius="full" />
              <Skeleton width={120} height={14} />
            </div>
          </div>
        </section>

        {/* InlineError — Step 1.2.5 */}
        <section className="max-w-md">
          <h2 className="text-display-sm font-bold text-navy">InlineError — 1.2.5</h2>
          <div className="mt-4 space-y-3">
            <InlineError message="Impossible de charger tes données." onRetry={() => {}} />
            <InlineError message="Une erreur s'est produite." />
          </div>
        </section>

        {/* EmptyState — Step 1.2.5 */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">EmptyState — 1.2.5</h2>
          <Card className="mt-4 max-w-md">
            <EmptyState
              icon={<Inbox size={32} strokeWidth={1.5} />}
              title="Aucun rendez-vous cette semaine"
              description="Ajoute un rendez-vous ou demande à Claré de t'aider à planifier."
              ctaLabel="Ajouter"
              onCtaClick={() => {}}
            />
          </Card>
        </section>

        {/* OfflineBanner — Step 1.2.5 (toggle DevTools Offline mode to see it appear at the top) */}
        <section>
          <h2 className="text-display-sm font-bold text-navy">OfflineBanner — 1.2.5</h2>
          <p className="mt-2 text-body-sm text-text-light">
            Toggle Chrome DevTools "Offline" mode to see the banner slide in at the top of the
            viewport (it&apos;s mounted app-wide, not shown inline here).
          </p>
        </section>
      </div>

      <BottomTabNav activeKey={activeNav} onNavigate={(_, key) => setActiveNav(key)} className="lg:hidden" />
    </div>
  );
}
