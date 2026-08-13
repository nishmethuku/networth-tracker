import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/supabaseClient", () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(body),
  };
}

describe("api client cold-start retry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a GET once after a timeout and succeeds on the second attempt", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    global.fetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce(jsonResponse({ ok: true }));

    const events = [];
    window.addEventListener("api:cold-start-retry", () => events.push("retry"));

    const { api } = await import("../client");
    const result = await api.get("/dashboard");

    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["retry"]);
  });

  it("does not retry a POST after a timeout", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    global.fetch.mockRejectedValueOnce(abortError);

    const { api, ApiError } = await import("../client");
    await expect(api.post("/holdings", { foo: "bar" })).rejects.toBeInstanceOf(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a GET when the server returns a real error response", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ error: "Not found" }, false, 404));

    const { api, ApiError } = await import("../client");
    await expect(api.get("/holdings/999")).rejects.toMatchObject({ status: 404 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates the error if the retry also fails", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    global.fetch.mockRejectedValueOnce(abortError).mockRejectedValueOnce(abortError);

    const { api } = await import("../client");
    await expect(api.get("/dashboard")).rejects.toMatchObject({ status: 408 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
