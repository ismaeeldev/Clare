import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { AgendaScreen } from "./AgendaScreen";

/**
 * AgendaRoute — router-level wrapper for AgendaScreen (Step 3.3). Auth is
 * already guaranteed by ProtectedRoute at the router level, but `user` can
 * still be momentarily null on first render before the auth listener
 * fires — guard with a brief skeleton rather than assuming non-null.
 */
export function AgendaRoute() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <AgendaScreen userId={user.id} />;
}
