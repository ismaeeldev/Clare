import { useAuth } from "@/hooks/useAuth";
import { RoutineScreen } from "./RoutineScreen";

/**
 * RoutineRoute — router-level wrapper for RoutineScreen.
 * Wires userId to Supabase profile preferences.
 */
export function RoutineRoute() {
  const { user } = useAuth();
  return <RoutineScreen userId={user?.id} onRoutineUpdated={() => {}} />;
}
