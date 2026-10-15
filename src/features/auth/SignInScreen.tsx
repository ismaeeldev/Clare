import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineError } from "@/components/ui/InlineError";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { apiCall, ApiTimeoutError } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./AuthLayout";

/**
 * SignInScreen — Lavish, luxury authentication screen
 * Features:
 * - Icon-adorned inputs with clean focus states
 * - Password visibility toggle
 * - Network-aware submission state
 * - Smooth error feedback
 */
export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setStatus("error");
      setError("Connecte-toi à internet pour te connecter.");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      const { data, error: signInError } = await apiCall(() =>
        supabase.auth.signInWithPassword({ email: email.trim(), password })
      );
      if (signInError) throw signInError;

      const userId = data.user?.id;
      const { data: profile, error: profileError } = userId
        ? await supabase
            .from("profiles")
            .select("onboarding_complete")
            .eq("user_id", userId)
            .maybeSingle()
        : { data: null, error: null };
      if (profileError) throw profileError;

      const intendedRoute = (location.state as { from?: string } | null)?.from;
      if (intendedRoute) {
        navigate(intendedRoute, { replace: true });
      } else if (profile?.onboarding_complete) {
        navigate("/home", { replace: true });
      } else {
        navigate("/onboarding", { replace: true });
      }
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiTimeoutError) {
        setError("La connexion prend trop de temps. Vérifie ta connexion et réessaie.");
      } else if (err instanceof Error) {
        setError(
          err.message === "Invalid login credentials"
            ? "Email ou mot de passe incorrect."
            : "Une erreur est survenue. Réessaie."
        );
      } else {
        setError("Une erreur est survenue.");
      }
    }
  };

  return (
    <AuthLayout
      title="Bienvenue"
      subtitle="Connectez-vous à votre espace Claré d'excellence."
      badgeText="Espace Membre"
    >
      <form onSubmit={handleSubmit} className="space-y-4.5">
        {/* Email Field */}
        <div>
          <label
            htmlFor="signin-email"
            className="mb-1.5 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            Adresse Email
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Mail size={18} />
            </div>
            <input
              id="signin-email"
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
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="signin-password"
              className="block text-label font-bold uppercase tracking-[0.06em] text-meta"
            >
              Mot de passe
            </label>
            <Link
              to="/forgot-password"
              className="text-[12px] font-medium text-gold-text transition-colors hover:text-navy hover:underline"
            >
              Oublié ?
            </Link>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-light">
              <Lock size={18} />
            </div>
            <input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === "submitting"}
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
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
              <span>Connexion en cours...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Se connecter</span>
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
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
          Pas encore membre ?{" "}
          <Link
            to="/sign-up"
            className="font-bold text-navy decoration-gold underline-offset-4 hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
