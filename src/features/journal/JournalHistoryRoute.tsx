import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { JournalHistoryScreen } from "./JournalHistoryScreen";

/**
 * JournalHistoryRoute — router-level wrapper for JournalHistoryScreen
 * (Step 3.4 task 5).
 */
export function JournalHistoryRoute() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <JournalHistoryScreen userId={user.id} />;
}
