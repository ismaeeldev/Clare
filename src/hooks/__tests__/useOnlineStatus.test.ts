import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "../useOnlineStatus";

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useOnlineStatus", () => {
  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it("initializes from navigator.onLine (online)", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("initializes from navigator.onLine (offline)", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("flips to false when the window 'offline' event fires", () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("flips back to true when the window 'online' event fires", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up its event listeners on unmount (no memory leak / stale updates)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    removeSpy.mockRestore();
  });
});
