import { describe, it, expect } from "vitest";
import { initialTheme } from "../theme";

describe("initialTheme", () => {
  it("uses a saved choice over the device", () => {
    expect(initialTheme("light", true)).toBe("light");
    expect(initialTheme("dark", false)).toBe("dark");
  });
  it("follows the device when nothing valid is saved", () => {
    expect(initialTheme(null, true)).toBe("dark");
    expect(initialTheme(null, false)).toBe("light");
    expect(initialTheme("purple", true)).toBe("dark");
  });
});
