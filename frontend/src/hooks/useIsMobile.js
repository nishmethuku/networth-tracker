import { useEffect, useState } from "react";

// Matches the 640px breakpoint theme.css uses to swap the top nav for the
// mobile bottom nav — kept in sync so table/card switches happen at the
// same width as the rest of the mobile layout.
const MOBILE_BREAKPOINT = "(max-width: 640px)";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
