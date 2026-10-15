import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { AdminScreen, type AdminMetrics } from "./AdminScreen";

/**
 * AdminRoute — Step 7.3. NOT in normal app navigation (per master prompt:
 * "a separate, allow-listed admin route... NOT in normal app
 * navigation") — reachable only by typing /admin directly. The real
 * access control is server-side (admin-metrics checks admin_users before
 * returning anything); this route has no client-side allow-list of its
 * own to bypass, since a hidden frontend route is explicitly insufficient
 * per CLA-FR-022.
 */
export function AdminRoute() {
  const { user, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const loadMetrics = async (isManual = false, isMountedRef?: { current: boolean }) => {
    if (!user) return;
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const result = await callEdgeFunction<AdminMetrics>("admin-metrics", { period_days: 30 }, 20000);
      if (isMountedRef && !isMountedRef.current) return;
      setMetrics(result);
    } catch (e) {
      if (isMountedRef && !isMountedRef.current) return;
      const message = e instanceof Error ? e.message : "";
      if (message === "Unauthorized") {
        setForbidden(true);
      } else {
        setError(message || "Erreur de chargement.");
      }
    } finally {
      if (!isMountedRef || isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    const isMountedRef = { current: true };
    (async () => {
      await loadMetrics(false, isMountedRef);
    })();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  return (
    <AdminScreen
      metrics={metrics}
      loading={authLoading || loading}
      refreshing={refreshing}
      onRefresh={() => loadMetrics(true)}
      error={error}
      forbidden={forbidden}
    />
  );
}
