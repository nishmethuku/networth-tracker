export type Theme = "light" | "dark";

/** Saved choice if valid, else the device preference. */
export function initialTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === "dark" || saved === "light") return saved;
  return prefersDark ? "dark" : "light";
}

/** The color schemes a person can pick. Each one re-tints the whole app in both light and dark. */
export const PALETTES = [
  { id: "wine", label: "Wine", swatch: "#7d2e42" },
  { id: "ocean", label: "Ocean", swatch: "#1f5a8a" },
  { id: "forest", label: "Forest", swatch: "#2a6a45" },
  { id: "violet", label: "Violet", swatch: "#5b3a8c" },
  { id: "sunset", label: "Sunset", swatch: "#a64a14" },
  { id: "graphite", label: "Graphite", swatch: "#3d4756" },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export const DEFAULT_PALETTE: PaletteId = "wine";

/** Saved scheme if it is one we know, else the default. */
export function initialPalette(saved: string | null): PaletteId {
  return PALETTES.some((p) => p.id === saved) ? (saved as PaletteId) : DEFAULT_PALETTE;
}
