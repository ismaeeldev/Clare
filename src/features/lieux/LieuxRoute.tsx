import { useAuth } from "@/hooks/useAuth";
import { LieuxScreen } from "./LieuxScreen";

/**
 * LieuxRoute — router-level wrapper for LieuxScreen.
 * Wires userId to Supabase profile preferences.
 */
export function LieuxRoute() {
  const { user } = useAuth();
  return <LieuxScreen userId={user?.id} onLieuxUpdated={() => {}} />;
}
