export type Theme = "light" | "dark";

/** Saved choice if valid, else the device preference. */
export function initialTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === "dark" || saved === "light") return saved;
  return prefersDark ? "dark" : "light";
}
