import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { JournalScreen } from "./JournalScreen";

/**
 * JournalRoute — router-level wrapper for JournalScreen (Step 3.4). Auth is
 * already guaranteed by ProtectedRoute at the router level, but `user` can
 * still be momentarily null before the auth listener's first event fires.
 */
export function JournalRoute() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <JournalScreen userId={user.id} />;
}
