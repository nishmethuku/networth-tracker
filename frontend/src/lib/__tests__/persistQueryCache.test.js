import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { PERSIST_KEY, restoreQueryCache, startPersistingQueryCache, clearPersistedQueryCache } from "../persistQueryCache";

function clientWith(key, data) {
  const c = new QueryClient();
  c.setQueryData(key, data);
  return c;
}

describe("persistQueryCache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("saves answers and brings them back for the same user", () => {
    const a = clientWith(["holdings", "USD"], [{ id: 1 }]);
    const stop = startPersistingQueryCache(a, "user-1");
    a.setQueryData(["dashboard", "USD"], { total: 5 });
    vi.advanceTimersByTime(2000);
    stop();
    const b = new QueryClient();
    expect(restoreQueryCache(b, "user-1")).toBeGreaterThan(0);
    expect(b.getQueryData(["dashboard", "USD"])).toEqual({ total: 5 });
  });

  it("never gives one user's saved data to another", () => {
    const a = clientWith(["holdings"], [1]);
    const stop = startPersistingQueryCache(a, "user-1");
    a.setQueryData(["x"], 1);
    vi.advanceTimersByTime(2000);
    stop();
    const b = new QueryClient();
    expect(restoreQueryCache(b, "user-2")).toBe(0);
    expect(b.getQueryData(["holdings"])).toBeUndefined();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("skips AI answers and clears on request", () => {
    const a = clientWith(["ai", "q"], "secret");
    a.setQueryData(["holdings"], [1]);
    const stop = startPersistingQueryCache(a, "user-1");
    a.setQueryData(["x"], 1);
    vi.advanceTimersByTime(2000);
    stop();
    expect(localStorage.getItem(PERSIST_KEY)).not.toContain("secret");
    clearPersistedQueryCache();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });
});
