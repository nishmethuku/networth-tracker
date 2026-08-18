import { describe, it, expect } from "vitest";
import { shouldRetryQuery } from "../queryClient";
import { ApiError } from "../api/client";

describe("shouldRetryQuery", () => {
  it("does not retry a cold-start-shaped timeout (client.js already retried it)", () => {
    expect(shouldRetryQuery(0, new ApiError("Request timed out.", 408))).toBe(false);
  });

  it("does not retry a cold-start-shaped network error (status 0)", () => {
    expect(shouldRetryQuery(0, new ApiError("Network error.", 0))).toBe(false);
  });

  it("retries a real server error once", () => {
    expect(shouldRetryQuery(0, new ApiError("Server error", 500))).toBe(true);
  });

  it("stops retrying a real server error after the first attempt", () => {
    expect(shouldRetryQuery(1, new ApiError("Server error", 500))).toBe(false);
  });

  it("retries a non-ApiError once, same as the default React Query behavior", () => {
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(true);
  });
});
