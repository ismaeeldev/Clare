import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowRight, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Loader2, 
  Lock, 
  WifiOff 
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiCall, ApiTimeoutError } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./AuthLayout";

/**
 * ResetPasswordScreen — Lavish screen for setting a new password after following a recovery link
 * Features:
 * - Password strength meter
 * - Confirmation password validation
 * - Instant feedback and smooth transition to success state
 */
export function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();

  // Password strength calculation
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
      setError("Connecte-toi à internet pour modifier ton mot de passe.");
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
      const { error: updateError } = await apiCall(() =>
        supabase.auth.updateUser({ password })
      );
      if (updateError) throw updateError;
      setStatus("success");
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiTimeoutError) {
        setError("La mise à jour prend trop de temps. Vérifie ta connexion et réessaie.");
      } else if (err instanceof Error) {
        setError(err.message || "Une erreur est survenue lors de la réinitialisation.");
      } else {
        setError("Une erreur est survenue.");
      }
    }
  };

  if (status === "success") {
    return (
      <AuthLayout
        title="Mot de passe modifié"
        subtitle="Votre nouveau mot de passe est désormais actif."
        badgeText="Mise à jour réussie"
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-green/30 bg-green-soft text-green shadow-[0_8px_32px_rgba(45,155,111,0.2)]">
            <CheckCircle2 size={38} className="text-green-text" />
          </div>

          <p className="text-body text-text-mid">
            Vous pouvez maintenant vous connecter à votre compte Claré en toute sécurité.
          </p>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => navigate("/sign-in", { replace: true })}
            className="mt-6 h-12 text-[15px] font-bold shadow-raised"
          >
            <span>Aller à la connexion</span>
            <ArrowRight size={17} />
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe sécurisé pour votre compte."
      badgeText="Sécurité renforcée"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New Password */}
        <div>
          <label
            htmlFor="reset-password"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Nouveau mot de passe
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Lock size={18} />
            </div>
            <input
              id="reset-password"
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

          {/* Strength Meter */}
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

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="reset-confirm-password"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Confirmer le mot de passe
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <KeyRound size={18} />
            </div>
            <input
              id="reset-confirm-password"
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
              <span>Enregistrement...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Enregistrer le mot de passe</span>
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

      {/* Footer */}
      <div className="mt-8 border-t border-border/70 pt-5 text-center">
        <Link
          to="/sign-in"
          className="text-body-sm font-bold text-navy hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    </AuthLayout>
  );
}
