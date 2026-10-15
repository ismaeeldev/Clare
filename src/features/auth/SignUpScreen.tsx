import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  RotateCw,
  WifiOff,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiCall, ApiTimeoutError } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./AuthLayout";

/**
 * SignUpScreen — Lavish, high-end registration screen
 * Features:
 * - Real-time password strength indicator
 * - Dynamic email verification step
 * - Real Resend Confirmation Email functionality with 60s countdown timer
 * - Offline detection & accessible inline error states
 */
export function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "verify">("idle");
  const [error, setError] = useState("");
  
  // Resend confirmation state
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  const isOnline = useOnlineStatus();

  // Handle resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Password strength score calculation (0 to 4)
  const calculateStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score;
  };

  const strength = calculateStrength(password);
  const strengthLabels = ["Très court", "Faible", "Moyen", "Robuste", "Excellent"];
  const strengthColors = [
    "bg-border",
    "bg-red",
    "bg-amber",
    "bg-gold",
    "bg-green",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setStatus("error");
      setError("Connecte-toi à internet pour créer un compte.");
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setStatus("submitting");
    setError("");
    try {
      const { error: signUpError } = await apiCall(() =>
        supabase.auth.signUp({ email: email.trim(), password })
      );
      if (signUpError) throw signUpError;
      setStatus("verify");
      setResendCooldown(60); // Start initial cooldown
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiTimeoutError) {
        setError("La création de compte prend trop de temps. Vérifie ta connexion et réessaie.");
      } else if (err instanceof Error) {
        setError(
          err.message === "User already registered"
            ? "Un compte existe déjà avec cette adresse email."
            : "Une erreur est survenue lors de l'inscription. Réessaie."
        );
      } else {
        setError("Une erreur est survenue.");
      }
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || resendStatus === "sending") return;
    if (!isOnline) {
      setResendStatus("error");
      setResendError("Connecte-toi à internet pour renvoyer le lien.");
      return;
    }

    setResendStatus("sending");
    setResendError("");
    try {
      const { error: resendApiError } = await apiCall(() =>
        supabase.auth.resend({
          type: "signup",
          email: email.trim(),
        })
      );
      if (resendApiError) throw resendApiError;
      setResendStatus("sent");
      setResendCooldown(60);
    } catch (err) {
      setResendStatus("error");
      setResendError(
        err instanceof ApiTimeoutError
          ? "Le serveur met du temps à répondre. Réessaie dans un instant."
          : "Impossible de renvoyer l'email pour le moment. Réessaie plus tard."
      );
    }
  };

  // Verification Screen View (Check your email + Resend option)
  if (status === "verify") {
    return (
      <AuthLayout
        title="Vérifiez votre boîte mail"
        subtitle="Un email d'activation vous a été envoyé"
        badgeText="Vérification requise"
      >
        <div className="text-center">
          {/* Animated Mail Badge */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-gold/30 bg-gold-soft text-gold shadow-gold-glow">
            <MailCheck size={38} className="text-gold-text" />
          </div>

          <div className="rounded-xl border border-border bg-bg/60 p-4 text-left">
            <p className="text-body-sm text-text-mid">
              Nous avons transmis un lien sécurisé d'activation à :
            </p>
            <p className="mt-1 font-semibold text-navy break-all">{email}</p>
          </div>

          <p className="mt-4 text-caption text-meta">
            Cliquez sur le lien reçu pour activer votre compte. Pensez à vérifier votre dossier de courriers indésirables (spams).
          </p>

          {/* Resend Confirmation Section */}
          <div className="mt-6 border-t border-border/70 pt-5">
            {resendStatus === "sent" && (
              <div className="mb-3 flex items-center justify-center gap-1.5 rounded-lg bg-green-soft p-2.5 text-body-sm font-medium text-green-text">
                <Check size={16} />
                <span>Nouveau lien d'activation envoyé avec succès !</span>
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
              onClick={handleResendVerification}
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
                  <span>Renvoyer l'email ({resendCooldown}s)</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 font-semibold">
                  <RotateCw size={15} />
                  <span>Renvoyer l'email de confirmation</span>
                </span>
              )}
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setResendStatus("idle");
              }}
              className="text-body-sm font-medium text-gold-text hover:text-navy hover:underline"
            >
              Modifier l'adresse email
            </button>

            <Link
              to="/sign-in"
              className="inline-block text-body-sm font-bold text-navy hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Standard Registration Form
  return (
    <AuthLayout
      title="Créer votre compte"
      subtitle="Rejoignez Claré et sublimez votre quotidien."
      badgeText="Nouvelle Adhésion"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label
            htmlFor="signup-email"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Adresse Email
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Mail size={18} />
            </div>
            <input
              id="signup-email"
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

        {/* Password Field */}
        <div>
          <label
            htmlFor="signup-password"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Mot de passe
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Lock size={18} />
            </div>
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === "submitting"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              className="box-border w-full rounded-xl border border-border bg-bg/50 py-3 pl-11 pr-11 font-ui text-[16px] text-text placeholder:text-text-muted transition-all duration-200 focus:border-navy focus:bg-white focus:shadow-[0_0_0_3px_rgba(201,168,76,0.18)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text-light transition-colors hover:text-navy"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Password Strength Meter */}
          {password.length > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-meta">
                <span>Force du mot de passe</span>
                <span className="font-semibold text-navy">{strengthLabels[strength]}</span>
              </div>
              <div className="mt-1 flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-border">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full flex-1 rounded-full transition-all duration-300 ${
                      step <= strength ? strengthColors[strength] : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password Field */}
        <div>
          <label
            htmlFor="signup-confirm-password"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Confirmer le mot de passe
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <KeyRound size={18} />
            </div>
            <input
              id="signup-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={status === "submitting"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Retapez le mot de passe"
              className="box-border w-full rounded-xl border border-border bg-bg/50 py-3 pl-11 pr-11 font-ui text-[16px] text-text placeholder:text-text-muted transition-all duration-200 focus:border-navy focus:bg-white focus:shadow-[0_0_0_3px_rgba(201,168,76,0.18)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
              aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-text-light transition-colors hover:text-navy"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Benefits Note */}
        <div className="rounded-xl border border-gold/20 bg-gold-soft/50 p-3 text-[12px] leading-relaxed text-gold-text">
          <span className="flex items-center gap-1.5 font-bold">
            <Sparkles size={13} className="text-gold" />
            Accompagnement d'excellence
          </span>
          <p className="mt-0.5 text-meta">
            Votre assistant personnel sécurisé et sur-mesure pour votre organisation quotidienne.
          </p>
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
              <span>Création de votre espace...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Créer mon compte</span>
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

      {/* Footer Switcher */}
      <div className="mt-8 border-t border-border/70 pt-5 text-center">
        <p className="text-body-sm text-text-mid">
          Vous possédez déjà un compte ?{" "}
          <Link
            to="/sign-in"
            className="font-bold text-navy decoration-gold underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
