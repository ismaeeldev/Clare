import { describe, it, expect, vi } from "vitest";
import { fetchIntegrations, startGoogleCalendarConnect, disconnectGoogleCalendar, syncGoogleCalendar } from "../integrationsRepo";
import { supabase } from "../supabase";
import { callEdgeFunction } from "../edgeFunctions";

vi.mock("../supabase", () => {
  const fromMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
    },
  };
});

vi.mock("../edgeFunctions", () => ({
  callEdgeFunction: vi.fn(),
}));

describe("integrationsRepo", () => {
  it("fetches user integration connections correctly", async () => {
    const mockConnections = [
      {
        id: "1",
        user_id: "user-123",
        provider: "google_calendar",
        status: "connected",
        last_synced_at: "2026-09-27T00:00:00Z",
        created_at: "2026-09-27T00:00:00Z",
        updated_at: "2026-09-27T00:00:00Z",
      },
    ];

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: mockConnections, error: null }),
    });

    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: selectMock,
    });

    const result = await fetchIntegrations("user-123");
    expect(result).toEqual(mockConnections);
  });

  it("startGoogleCalendarConnect fetches the consent URL and redirects the browser", async () => {
    (callEdgeFunction as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?foo=bar" });
    const originalLocation = window.location;
    const stub = { href: "" };
    Object.defineProperty(window, "location", { value: stub, writable: true, configurable: true });

    await startGoogleCalendarConnect();

    expect(callEdgeFunction).toHaveBeenCalledWith("google-oauth-start", {}, 15000);
    expect(stub.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?foo=bar");

    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
  });

  it("disconnectGoogleCalendar calls the disconnect edge function, never writes the table directly", async () => {
    (callEdgeFunction as ReturnType<typeof vi.fn>).mockResolvedValue({ disconnected: true });
    // supabase.from's call history accumulates across tests in this file
    // (a legitimate read happens in the fetchIntegrations test above) —
    // reset it here so this assertion checks only what THIS call does.
    (supabase.from as ReturnType<typeof vi.fn>).mockClear();

    await disconnectGoogleCalendar();

    expect(callEdgeFunction).toHaveBeenCalledWith("google-oauth-disconnect", {}, 20000);
    // The client must never call supabase.from("integration_connections") to
    // write — migration 0019 removed the client's insert/update policy on
    // that table specifically so a direct write like the old
    // setIntegrationStatus() could never happen again.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("syncGoogleCalendar calls the sync edge function and returns its summary", async () => {
    (callEdgeFunction as ReturnType<typeof vi.fn>).mockResolvedValue({ imported: 12, skipped: 1, total: 13 });

    const result = await syncGoogleCalendar();

    expect(callEdgeFunction).toHaveBeenCalledWith("google-calendar-sync", {}, 45000);
    expect(result).toEqual({ imported: 12, skipped: 1, total: 13 });
  });
});
