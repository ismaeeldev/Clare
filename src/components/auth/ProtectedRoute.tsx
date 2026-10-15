import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";

/**
 * ProtectedRoute — Step 2.3's Master Prompt task 2 ("session-check wrapper
 * (protected route component)"). Wraps any route element: while the auth
 * listener hasn't reported its first state yet, shows a loading skeleton
 * (not a flash of the sign-in screen or the protected content); once
 * resolved, either renders children or redirects to /sign-in carrying the
 * current path as router state so SignInScreen can return here after auth
 * (per 04_ApplicationFlow.md §2.1's "unauthenticated deep-link... return to
 * intended route after auth" edge case).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
