import { useEffect, useState } from "react";

// Matches the 640px breakpoint theme.css uses to swap the top nav for the
// mobile bottom nav — kept in sync so table/card switches happen at the
// same width as the rest of the mobile layout.
const MOBILE_BREAKPOINT = "(max-width: 640px)";

/**
 * Tracks whether the viewport is at or below the app's mobile breakpoint
 * (640px), updating live as the window is resized or a device is rotated.
 * @returns true when the viewport matches the mobile breakpoint.
 */
export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
