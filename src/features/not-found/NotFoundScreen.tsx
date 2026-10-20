import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * NotFoundScreen — the one catch-all for any unmatched/stale route
 * (mistyped URL, a removed route, a stale notification deep_link) and
 * router.tsx's errorElement. Previously there was neither: an unmatched
 * path hit React Router's bare default error screen with no app chrome
 * and no way back except the browser's Back button — found during a
 * navigation audit alongside the already-fixed Vercel SPA-rewrite 404
 * (same underlying gap, client-side half).
 */
export function NotFoundScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 font-ui">
      <EmptyState
        icon="🧭"
        title="Page introuvable"
        description="Ce lien n'existe pas ou a changé. Retourne à l'accueil pour continuer."
        ctaLabel="Retour à l'accueil"
        onCtaClick={() => navigate("/home")}
      />
    </div>
  );
}
