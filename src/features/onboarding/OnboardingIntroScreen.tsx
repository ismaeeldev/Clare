import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface IntroStep {
  icon: string;
  badge: string;
  title: string;
  sub: string;
  btn: string;
}

const introSteps: IntroStep[] = [
  {
    icon: "◈",
    badge: "✦ Bienvenue sur Claré",
    title: "L'intelligence artificielle au service de ta liberté.",
    sub: "Tu t'es lancé pour être libre. Claré s'occupe du reste — pour que tu puisses enfin vivre pleinement la vie pour laquelle tu t'es lancé.",
    btn: "Découvrir Claré →",
  },
  {
    icon: "🧠",
    badge: "✦ Proactivité & Organisation",
    title: "Il fait le travail. Toi tu valides.",
    sub: "Parle naturellement. Claré détecte les imprévus, réorganise ta semaine, ajuste tes repas et prépare ton dimanche soir en cascade.",
    btn: "Continuer →",
  },
  {
    icon: "📊",
    badge: "✦ Lucidité & Anticipation",
    title: "Il voit ce que tu ne vois pas.",
    sub: "Fatigue croissante, projets délaissés, finances sous le rythme. Claré te prévient avant que tu ne le réalises — basé sur tes vraies données.",
    btn: "Continuer →",
  },
  {
    icon: "🎯",
    badge: "✦ Conçu pour les Indépendants",
    title: "Ton copilote personnel disponible 24/7.",
    sub: "T'as pas d'équipe ? Claré combine ton chef de staff, ton coach sportif, ton nutritionniste et ton comptable en un seul endroit.",
    btn: "Créer mon espace →",
  },
];

export function OnboardingIntroScreen({ onDone }: { onDone: () => void }) {
  const [introStep, setIntroStep] = useState(0);
  const s = introSteps[introStep];
  const isLast = introStep === introSteps.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (isLast) onDone();
        else setIntroStep((i) => Math.min(i + 1, introSteps.length - 1));
      } else if (e.key === "ArrowLeft" && introStep > 0) {
        setIntroStep((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [introStep, isLast, onDone]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#13172E] px-6 py-10 font-ui text-center selection:bg-gold selection:text-navy">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-gold/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple/20 blur-[130px]" />

      {/* Skip button top right */}
      {introStep < introSteps.length - 1 && (
        <button
          type="button"
          onClick={onDone}
          className="absolute right-6 top-6 z-20 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold text-white/60 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          Passer l'intro →
        </button>
      )}

      {/* Main Glass Card */}
      <div className="relative z-10 w-full max-w-[460px] rounded-3xl border border-white/10 bg-white/[0.04] p-8 sm:p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl">
        {/* Progress Bar with pills */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {introSteps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIntroStep(i)}
              className="group py-2 cursor-pointer"
              aria-label={`Aller à l'étape ${i + 1}`}
            >
              <motion.div
                animate={{ 
                  width: i === introStep ? 32 : 10,
                  backgroundColor: i <= introStep ? "var(--color-gold)" : "rgba(255, 255, 255, 0.15)"
                }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="h-1.5 rounded-full group-hover:opacity-100"
              />
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={introStep}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            {/* Step Badge */}
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-1 text-[11px] font-bold text-gold tracking-wide">
              {s.badge}
            </span>

            {/* Icon with glow */}
            <motion.div
              initial={{ scale: 0.8, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`mb-6 flex h-20 w-20 items-center justify-center rounded-2xl shadow-lg ${
                introStep === 0 
                  ? "bg-gold text-navy shadow-gold/20" 
                  : "border border-white/10 bg-white/10 text-white shadow-black/20"
              }`}
              style={{ fontSize: introStep === 0 ? 38 : 42 }}
            >
              {s.icon}
            </motion.div>

            <h1 className="font-display mb-3 text-[22px] font-extrabold text-white sm:text-[25px] leading-tight">
              {s.title}
            </h1>

            <p className="mb-8 text-sm text-white/75 sm:text-[15px] leading-relaxed">
              {s.sub}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* CTA Button */}
        <Button
          variant="accent"
          size="lg"
          onClick={() => (isLast ? onDone() : setIntroStep((i) => i + 1))}
          className="w-full py-3.5 text-sm font-bold shadow-raised cursor-pointer"
        >
          {s.btn}
        </Button>

        {/* Previous step link */}
        {introStep > 0 && (
          <button
            type="button"
            onClick={() => setIntroStep((i) => i - 1)}
            className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/40 transition-colors duration-200 hover:text-white/80 cursor-pointer mx-auto"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Étape précédente
          </button>
        )}
      </div>

      <p className="relative z-10 mt-6 text-[11px] text-white/30">
        Appuie sur Entrée ou les touches fléchées pour naviguer
      </p>
    </main>
  );
}

