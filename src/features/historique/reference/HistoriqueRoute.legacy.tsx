import { HistoriqueScreen } from "./HistoriqueScreen";

/**
 * HistoriqueRoute — router-level wrapper for HistoriqueScreen, same pattern
 * as the other Step 1.3 screens. Placeholder empty journal per Step 1.3's
 * scope boundary — Step 3 replaces this with real Supabase-backed data.
 */
export function HistoriqueRoute() {
  return <HistoriqueScreen journal={[]} />;
}
