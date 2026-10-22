import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { pageTitle } from "../utils/pageTitle";

/**
 * On every page change: set the tab title, and move keyboard focus to the main
 * area so screen reader and keyboard users start at the top of the new page.
 * Focus only moves when nothing else (like an autofocused field) already has it.
 */
export default function RouteAnnouncer() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    document.title = pageTitle(pathname);
    if (first.current) {
      first.current = false;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
