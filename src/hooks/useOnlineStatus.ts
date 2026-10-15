import { useEffect, useState } from "react";

/**
 * useOnlineStatus — wraps navigator.onLine + 'online'/'offline' window
 * events. Step 1.2.5 primitive, consumed by OfflineBanner (this step) and
 * every screen's offline-handling logic from Step 2 onward (e.g. disabling
 * network-dependent submit buttons per docs/04_ApplicationFlow.md §3).
 *
 * Deliberately distinct from "slow network" — navigator.onLine only reflects
 * whether the device has *any* network interface active, not connection
 * quality. Slow-network handling is a separate concern, covered by
 * apiClient.ts's timeout behavior in this same step.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
