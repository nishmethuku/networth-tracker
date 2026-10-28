import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/supabaseClient", () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));

import { isRecentLoginRequired } from "../index";
import { ApiError } from "../client";

describe("isRecentLoginRequired", () => {
  it("recognises the server's fresh sign-in request", () => {
    expect(
      isRecentLoginRequired(new ApiError("For your security, sign in again to do this.", 403, { code: "recent_login_required" })),
    ).toBe(true);
  });

  it("ignores other 403s, other errors and non-errors", () => {
    expect(isRecentLoginRequired(new ApiError("Forbidden", 403, { error: "nope" }))).toBe(false);
    expect(isRecentLoginRequired(new ApiError("x", 401, { code: "recent_login_required" }))).toBe(false);
    expect(isRecentLoginRequired(new Error("x"))).toBe(false);
    expect(isRecentLoginRequired(null)).toBe(false);
  });
});
