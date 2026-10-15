import { useState } from "react";
import { AgendaScreen } from "./AgendaScreen";
import type { AgendaEvent } from "./types";

/**
 * AgendaRoute — router-level wrapper for AgendaScreen, same pattern as
 * HomeRoute/ChatRoute/JournalRoute/FocusRoute. Local state stands in for
 * Supabase per Step 1.3's scope boundary — Step 3 replaces this with real
 * queries/mutations, same prop shape.
 */
const PLACEHOLDER_DATA = {
  profile: { prenom: "" },
  journal: [],
  finances: {},
};

export function AgendaRoute() {
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);

  return <AgendaScreen {...PLACEHOLDER_DATA} agenda={agenda} setAgenda={setAgenda} />;
}
