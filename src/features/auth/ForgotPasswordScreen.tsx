import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  KeyRound, 
  Loader2, 
  Mail, 
  RotateCw, 
  WifiOff 
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiCall, ApiTimeoutError } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./AuthLayout";

/**
 * ForgotPasswordScreen — Lavish password recovery screen
 * Features:
 * - Clean, distraction-free email submission
 * - Sent confirmation screen with real Resend capability & cooldown timer
 * - Preserves security best practices (no account enumeration)
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "sent">("idle");
  const [error, setError] = useState("");
  
  // Resend cooldown state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  const isOnline = useOnlineStatus();

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setStatus("error");
      setError("Connecte-toi à internet pour réinitialiser ton mot de passe.");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      const { error: resetError } = await apiCall(() =>
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      );
      if (resetError) throw resetError;
      setStatus("sent");
      setResendCooldown(60);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ApiTimeoutError
          ? "L'envoi prend trop de temps. Vérifie ta connexion et réessaie."
          : "Une erreur est survenue lors de l'envoi."
      );
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendStatus === "sending") return;
    if (!isOnline) {
      setResendStatus("error");
      setResendError("Connecte-toi à internet pour renvoyer le lien.");
      return;
    }

    setResendStatus("sending");
    setResendError("");
    try {
      const { error: resetError } = await apiCall(() =>
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      );
      if (resetError) throw resetError;
      setResendStatus("sent");
      setResendCooldown(60);
    } catch (err) {
      setResendStatus("error");
      setResendError(
        err instanceof ApiTimeoutError
          ? "Le serveur met du temps à répondre. Réessaie dans un instant."
          : "Impossible de renvoyer le lien actuellement. Réessaie plus tard."
      );
    }
  };

  // Sent state view (Confirmation & Resend)
  if (status === "sent") {
    return (
      <AuthLayout
        title="Lien envoyé"
        subtitle="Consultez votre messagerie pour réinitialiser votre accès"
        badgeText="Sécurité du compte"
      >
        <div className="text-center">
          {/* Animated Key/Mail Badge */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-gold-soft text-gold shadow-gold-glow">
            <KeyRound size={36} className="text-gold-text" />
          </div>

          <div className="rounded-xl border border-border bg-bg/60 p-4 text-left">
            <p className="text-body-sm text-text-mid">
              Si un compte est associé à cette adresse, un lien sécurisé a été transmis à :
            </p>
            <p className="mt-1 font-semibold text-navy break-all">{email}</p>
          </div>

          <p className="mt-4 text-caption text-meta">
            Le lien reste valide pendant un temps limité. Pensez à vérifier votre dossier de courriers indésirables (spams).
          </p>

          {/* Resend Section */}
          <div className="mt-6 border-t border-border/70 pt-5">
            {resendStatus === "sent" && (
              <div className="mb-3 flex items-center justify-center gap-1.5 rounded-lg bg-green-soft p-2.5 text-body-sm font-medium text-green-text">
                <Check size={16} />
                <span>Nouveau lien envoyé avec succès !</span>
              </div>
            )}

            {resendStatus === "error" && (
              <div className="mb-3">
                <InlineError message={resendError} />
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={handleResend}
              disabled={resendCooldown > 0 || resendStatus === "sending" || !isOnline}
              className="h-11 text-body-sm"
            >
              {resendStatus === "sending" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-navy" />
                  <span>Renvoi en cours...</span>
                </span>
              ) : resendCooldown > 0 ? (
                <span className="flex items-center justify-center gap-2 text-text-muted">
                  <RotateCw size={15} />
                  <span>Renvoyer le lien ({resendCooldown}s)</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 font-semibold">
                  <RotateCw size={15} />
                  <span>Renvoyer le lien de réinitialisation</span>
                </span>
              )}
            </Button>
          </div>

          <div className="mt-5">
            <Link
              to="/sign-in"
              className="inline-flex items-center justify-center gap-1.5 text-body-sm font-bold text-navy hover:underline"
            >
              <ArrowLeft size={16} />
              <span>Retour à la connexion</span>
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Email entry form
  return (
    <AuthLayout
      title="Mot de passe oublié"
      subtitle="Recevez un lien direct pour réinitialiser votre accès à Claré."
      badgeText="Récupération d'accès"
    >
      <form onSubmit={handleSubmit} className="space-y-4.5">
        {/* Email Field */}
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Votre Adresse Email
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Mail size={18} />
            </div>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              required
              autoComplete="email"
              placeholder="nom@exemple.com"
              className="box-border w-full rounded-xl border border-border bg-bg/50 py-3 pl-11 pr-4 font-ui text-[16px] text-text placeholder:text-text-muted transition-all duration-200 focus:border-navy focus:bg-white focus:shadow-[0_0_0_3px_rgba(201,168,76,0.18)] focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Error Alert */}
        {status === "error" && (
          <InlineError message={error} onRetry={() => setStatus("idle")} />
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={status === "submitting" || !isOnline}
          className="mt-2 h-12 text-[15px] font-bold shadow-raised hover:shadow-floating"
        >
          {status === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin text-gold" />
              <span>Envoi du lien en cours...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Envoyer le lien de réinitialisation</span>
              <ArrowRight size={17} />
            </span>
          )}
        </Button>

        {/* Offline Warning */}
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-soft p-2.5 text-center text-body-sm text-amber-text">
            <WifiOff size={16} />
            <span>Mode hors ligne — connexion internet requise.</span>
          </div>
        )}
      </form>

      {/* Footer Return */}
      <div className="mt-8 border-t border-border/70 pt-5 text-center">
        <Link
          to="/sign-in"
          className="inline-flex items-center justify-center gap-1.5 text-body-sm font-bold text-navy hover:underline"
        >
          <ArrowLeft size={16} />
          <span>Retour à la connexion</span>
        </Link>
      </div>
    </AuthLayout>
  );
}
