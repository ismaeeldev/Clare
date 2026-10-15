import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";

/**
 * GuestRoute — inverse of ProtectedRoute: wraps the auth screens
 * (/sign-in, /sign-up, /forgot-password, /reset-password) so an already
 * signed-in user visiting one directly lands on /home instead of seeing
 * the auth form again. ResetPasswordScreen is deliberately NOT wrapped in
 * this — Supabase's password-recovery flow signs the user in via the
 * recovery link before they reach that screen, so gating it here would
 * redirect them away before they could set their new password.
 */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
