import { describe, it, expect } from "vitest";
import { initialTheme, initialPalette, PALETTES, DEFAULT_PALETTE } from "../theme";
import { readFileSync } from "node:fs";

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

describe("color schemes", () => {
  it("falls back to the default for anything unknown", () => {
    expect(initialPalette("ocean")).toBe("ocean");
    expect(initialPalette("neon")).toBe(DEFAULT_PALETTE);
    expect(initialPalette(null)).toBe(DEFAULT_PALETTE);
  });
  it("has a light and a dark stylesheet block for every non-default scheme", () => {
    const css = readFileSync("src/styles/theme.css", "utf8");
    for (const p of PALETTES.filter((x) => x.id !== DEFAULT_PALETTE)) {
      expect(css).toContain(`[data-palette="${p.id}"][data-theme="light"]`);
      expect(css).toContain(`[data-palette="${p.id}"][data-theme="dark"]`);
    }
  });
  it("is the same list the page loads before first paint", () => {
    const html = readFileSync("index.html", "utf8");
    for (const p of PALETTES) expect(html).toContain(`"${p.id}"`);
  });
});
