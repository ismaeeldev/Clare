import { describe, it, expect, vi } from "vitest";
import { apiCall, ApiTimeoutError } from "../apiClient";

describe("apiCall", () => {
  it("resolves normally when the call finishes before the timeout", async () => {
    const result = await apiCall(() => Promise.resolve("ok"), { timeoutMs: 100 });
    expect(result).toBe("ok");
  });

  it("throws ApiTimeoutError when the call exceeds the timeout and retryOnTimeout is false", async () => {
    const slowCall = () => new Promise((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(apiCall(slowCall, { timeoutMs: 20 })).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it("retries exactly once on timeout when retryOnTimeout is true, and succeeds if the retry is fast enough", async () => {
    let attempt = 0;
    const call = () => {
      attempt += 1;
      // First call is slow (times out); second call (the retry) is fast.
      const delay = attempt === 1 ? 200 : 5;
      return new Promise((resolve) => setTimeout(() => resolve(attempt), delay));
    };
    const result = await apiCall(call, { timeoutMs: 20, retryOnTimeout: true });
    expect(result).toBe(2);
    expect(attempt).toBe(2);
  });

  it("does NOT retry when retryOnTimeout is false, even if the underlying call would eventually succeed", async () => {
    let attempt = 0;
    const call = () => {
      attempt += 1;
      return new Promise((resolve) => setTimeout(() => resolve(attempt), 200));
    };
    await expect(apiCall(call, { timeoutMs: 20 })).rejects.toBeInstanceOf(ApiTimeoutError);
    // Only the first (timed-out) attempt should have been made — this is the
    // hard write-safety rule: writes must never be silently re-issued.
    expect(attempt).toBe(1);
  });

  it("propagates a non-timeout error immediately without retrying, even when retryOnTimeout is true", async () => {
    let attempt = 0;
    const call = () => {
      attempt += 1;
      return Promise.reject(new Error("network refused"));
    };
    await expect(apiCall(call, { timeoutMs: 100, retryOnTimeout: true })).rejects.toThrow(
      "network refused"
    );
    expect(attempt).toBe(1);
  });

  it("calls fn() fresh on retry rather than reusing an already-settled promise", async () => {
    const fn = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve("v"), 5)));
    // First invocation times out immediately (0ms timeout), forcing a retry.
    fn.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve("late"), 50)));
    await apiCall(fn, { timeoutMs: 10, retryOnTimeout: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("handles timeoutMs = 0 by timing out essentially immediately", async () => {
    const neverResolves = () => new Promise(() => {});
    await expect(apiCall(neverResolves, { timeoutMs: 0 })).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it("a fast call still resolves correctly even with a very short timeout, if it beats the timer", async () => {
    const result = await apiCall(() => Promise.resolve("instant"), { timeoutMs: 1 });
    expect(result).toBe("instant");
  });

  it("does not produce an unhandled rejection when the underlying call rejects after the timeout already fired", async () => {
    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", handler);

    const slowThenReject = () =>
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late failure")), 60));

    await expect(apiCall(slowThenReject, { timeoutMs: 10 })).rejects.toBeInstanceOf(ApiTimeoutError);
    // Give the slow call time to actually reject internally after we've already timed out.
    await new Promise((r) => setTimeout(r, 100));

    process.off("unhandledRejection", handler);
    expect(unhandled).toHaveLength(0);
  });
});
