import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { fetchOpenTasks, type Task } from "@/lib/agendaRepo";
import { FocusScreen } from "./FocusScreen";

/**
 * FocusRoute — router-level wrapper for FocusScreen. Step 7.6 wired real
 * `focus_sessions` persistence and a real open-tasks picker.
 */
export function FocusRoute() {
  const { user, loading: authLoading } = useAuth();
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = () => {
    if (!user) return;
    setLoadingTasks(true);
    setLoadError("");
    fetchOpenTasks(user.id)
      .then((tasks) => setOpenTasks(tasks.filter((t) => t.status === "open")))
      .catch(() => {
        // Without this, a failed fetch left `openTasks` at its initial []
        // and rendered "Aucune tâche ouverte" — indistinguishable from
        // genuinely having none.
        setLoadError("Le chargement de tes tâches a échoué.");
      })
      .finally(() => setLoadingTasks(false));
  };

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return <FocusScreen userId={user.id} openTasks={openTasks} onSessionDone={() => {}} loading={loadingTasks} loadError={loadError} onRetryLoad={load} />;
}
