import { initialTheme, type Theme } from "../utils/theme";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // A saved choice wins; otherwise follow the device's light or dark setting.
  const [theme, setTheme] = useState<Theme>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      /* storage blocked */
    }
    return initialTheme(saved, typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  });

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Only an explicit toggle is saved, so people who never choose keep following their device.
  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* storage blocked */
      }
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
