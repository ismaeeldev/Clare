import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { ApiTimeoutError } from "@/lib/apiClient";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, type NotificationRow } from "@/lib/notificationsRepo";
import { NotificationsScreen } from "./NotificationsScreen";

export function NotificationsRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // Bumped on every load so a slower, superseded request can detect it's
  // stale and skip applying its result — same race-condition guard used
  // elsewhere for rapid refresh clicks.
  const requestIdRef = useRef(0);

  const loadNotifications = async (isManual = false) => {
    if (!user) return;
    const requestId = ++requestIdRef.current;
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoadingData(true);
    }
    try {
      const rows = await fetchNotifications(user.id);
      if (requestIdRef.current !== requestId) return;
      setNotifications(rows);
      setError("");
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof ApiTimeoutError ? "Le chargement prend trop de temps. Vérifie ta connexion et réessaie." : "Le chargement des notifications a échoué.");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingData(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      await loadNotifications();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleTap = async (n: NotificationRow) => {
    if (!n.read) {
      const previous = notifications;
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await markNotificationRead(n.id);
        setError("");
      } catch (err) {
        // Roll back the optimistic flip and surface the failure instead of
        // silently leaving the item marked "read" while the DB still has it
        // unread (and the bell badge drifting out of sync).
        setNotifications(previous);
        setError(err instanceof ApiTimeoutError ? "Le marquage comme lu prend trop de temps. Vérifie ta connexion et réessaie." : "Le marquage comme lu a échoué.");
        return;
      }
    }
    if (n.deep_link) navigate(n.deep_link);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead(user.id);
      setError("");
    } catch (err) {
      // Roll back — a silent failure here would show every notification as
      // read while the server still has them unread.
      setNotifications(previous);
      setError(err instanceof ApiTimeoutError ? "L'opération prend trop de temps. Vérifie ta connexion et réessaie." : "Le marquage de toutes les notifications a échoué.");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Skeleton width={200} height={24} />
      </div>
    );
  }

  return (
    <NotificationsScreen
      notifications={notifications}
      onBack={() => navigate("/home")}
      onNotificationTap={handleTap}
      onMarkAllRead={handleMarkAllRead}
      loading={loadingData}
      refreshing={refreshing}
      onRefresh={() => loadNotifications(true)}
      error={error}
    />
  );
}
