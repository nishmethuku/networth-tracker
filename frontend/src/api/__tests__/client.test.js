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

describe("uploadWithColdStartRetry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once after a cold-start-shaped failure and succeeds on the second attempt", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    global.fetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce(jsonResponse({ configured: true, rows: [] }));

    const events = [];
    window.addEventListener("api:cold-start-retry", () => events.push("retry"));

    const { uploadWithColdStartRetry } = await import("../client");
    const result = await uploadWithColdStartRetry("/import/smart-parse", new FormData());

    expect(result).toEqual({ configured: true, rows: [] });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(events).toEqual(["retry"]);
  });

  it("does not set a Content-Type header (lets the browser set the multipart boundary)", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { uploadWithColdStartRetry } = await import("../client");
    await uploadWithColdStartRetry("/import/smart-parse", new FormData());

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("does not retry a real error response from the server", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ error: "file is required" }, false, 400));

    const { uploadWithColdStartRetry, ApiError } = await import("../client");
    await expect(uploadWithColdStartRetry("/import/smart-parse", new FormData())).rejects.toBeInstanceOf(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates the error if the retry also fails", async () => {
    const abortError = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    global.fetch.mockRejectedValueOnce(abortError).mockRejectedValueOnce(abortError);

    const { uploadWithColdStartRetry } = await import("../client");
    await expect(uploadWithColdStartRetry("/import/smart-parse", new FormData())).rejects.toMatchObject({ status: 408 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
