import { supabase } from "@/lib/supabase";
import { apiCall } from "@/lib/apiClient";
import { callEdgeFunction } from "@/lib/edgeFunctions";

export type IntegrationProvider = "google_calendar" | "strava";
export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationConnection {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * fetchIntegrations — reads integration connections for the authenticated user.
 */
export async function fetchIntegrations(userId: string): Promise<IntegrationConnection[]> {
  const { data, error } = await apiCall(
    () =>
      Promise.resolve(
        supabase
          .from("integration_connections")
          .select("id, user_id, provider, status, last_synced_at, created_at, updated_at")
          .eq("user_id", userId)
      ),
    { retryOnTimeout: true }
  );
  if (error) throw error;
  return (data as IntegrationConnection[]) || [];
}

/**
 * startGoogleCalendarConnect — fetches the Google consent-screen URL and
 * redirects the browser there. The client never writes integration_
 * connections directly (migration 0019 removed its insert/update policy
 * on that table on purpose) — only google-oauth-callback, after Google
 * has actually confirmed the grant, is allowed to mark a connection
 * "connected". This mirrors stripe-checkout: the client only ever
 * requests a redirect URL, never self-grants the resulting state.
 */
export async function startGoogleCalendarConnect(): Promise<void> {
  const { url } = await callEdgeFunction<{ url: string }>("google-oauth-start", {}, 15000);
  window.location.href = url;
}

/**
 * disconnectGoogleCalendar — revokes the stored Google token server-side
 * and marks the connection disconnected. Routed through the edge function
 * (not a direct client table write) for the same reason as connect: the
 * client has no update policy on integration_connections.
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  await callEdgeFunction("google-oauth-disconnect", {}, 20000);
}

/**
 * syncGoogleCalendar — pulls the user's Google Calendar events into
 * calendar_items. Returns a small summary for the UI to show ("12
 * événements importés"), not the raw calendar_items rows — callers that
 * need the updated agenda should re-fetch it via agendaRepo separately.
 */
export async function syncGoogleCalendar(): Promise<{ imported: number; skipped: number; total: number }> {
  return callEdgeFunction<{ imported: number; skipped: number; total: number }>("google-calendar-sync", {}, 45000);
}
