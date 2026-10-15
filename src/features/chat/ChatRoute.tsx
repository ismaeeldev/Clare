import { useLocation, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { ChatScreen } from "./ChatScreen";

/**
 * ChatRoute — router-level wrapper for ChatScreen (Step 4.3). Reads
 * `initialMsg` from router navigation state (set by HomeRoute when a card
 * is tapped, e.g. "Je veux vider ma tête.") so Chat opens pre-filled with
 * the contextual message, matching the original App.jsx's
 * onChat(message) => setScreen("chat", message) behavior.
 */
export function ChatRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const initialMsg = (location.state as { initialMsg?: string } | null)?.initialMsg ?? "";

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <ChatScreen userId={user.id} initialMsg={initialMsg} onBack={() => navigate("/home")} />;
}
