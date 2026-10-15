import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchIdeas, type IdeaRow } from "@/lib/ideasRepo";
import { IdeesScreen } from "./IdeesScreen";

/**
 * IdeesRoute — router-level wrapper for IdeesScreen. Step 7.6 migrated
 * this off `clare_idees` localStorage onto the real `ideas` table.
 */
export function IdeesRoute() {
  const { user, loading: authLoading } = useAuth();
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = (isManual = false) => {
    if (!user) return;
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoadingData(true);
    }
    setLoadError("");
    fetchIdeas(user.id)
      .then(setIdeas)
      .catch(() => {
        // Without this, a failed fetch left `ideas` at its initial [] and
        // rendered the genuine "Aucune idée" empty state — indistinguishable
        // from actually having zero ideas.
        setLoadError("Le chargement de tes idées a échoué.");
      })
      .finally(() => {
        setLoadingData(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user) {
    return <IdeesScreen userId="" ideas={[]} loading onRefresh={() => {}} />;
  }

  return (
    <IdeesScreen
      userId={user.id}
      ideas={ideas}
      loading={loadingData}
      refreshing={refreshing}
      loadError={loadError}
      onRetryLoad={() => load(false)}
      onReload={() => load(true)}
      onRefresh={setIdeas}
    />
  );
}
