import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

export interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBadge?: boolean;
  badgeText?: string;
}

/**
 * AuthLayout — Lavish, luxury wrapper for all authentication screens
 * Features:
 * - Ambient warm gold & midnight navy radial gradients
 * - Frosted glass card with micro-borders and soft ambient shadows
 * - Brand emblem header with gold accents
 * - Responsive viewport scaling & accessibility
 */
export function AuthLayout({
  children,
  title,
  subtitle,
  showBadge = true,
  badgeText = "Édition Privée",
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-bg px-4 py-8 sm:px-6 lg:px-8">
      {/* Background Decorative Ambient Elements */}
      <div 
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(201,168,76,0.12)_0%,transparent_70%)] blur-3xl sm:h-[650px] sm:w-[650px]" 
        aria-hidden="true" 
      />
      <div 
        className="pointer-events-none absolute -bottom-32 right-[-10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(26,31,60,0.07)_0%,transparent_70%)] blur-2xl" 
        aria-hidden="true" 
      />
      <div 
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#c9a84c_0.75px,transparent_0.75px)] [background-size:24px_24px] opacity-15"
        aria-hidden="true"
      />

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[440px]"
      >
        {/* Luxury Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gold/20 bg-white/95 p-7 shadow-[0_16px_40px_rgba(26,31,60,0.06),0_1px_3px_rgba(26,31,60,0.04)] backdrop-blur-xl sm:p-9">
          {/* Top Gold Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent opacity-80" />

          {/* Header Brand Section */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-4">
              <Logo size={24} />
            </div>

            {showBadge && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold-soft px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-gold-text">
                <Sparkles size={12} className="text-gold" />
                <span>{badgeText}</span>
              </div>
            )}

            <h1 className="font-display text-display-sm font-extrabold tracking-tight text-navy sm:text-display">
              {title}
            </h1>
            
            {subtitle && (
              <p className="mt-2 text-body text-text-mid">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form Content */}
          <div className="mt-6">
            {children}
          </div>
        </div>

        {/* Security / Quality Footer Guarantee */}
        <div className="mt-6 flex items-center justify-center gap-2 text-center text-caption text-meta">
          <ShieldCheck size={14} className="text-gold-text" />
          <span>Espace sécurisé • Chiffrement de vos données</span>
        </div>
      </motion.div>
    </div>
  );
}
