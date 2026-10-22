import { useCallback, useState } from "react";
import { HIDDEN_SECTIONS_KEY, parseHiddenSections, serializeHiddenSections, toggleSection } from "../utils/dashboardSections";

function load(): Set<string> {
  try {
    return parseHiddenSections(localStorage.getItem(HIDDEN_SECTIONS_KEY));
  } catch {
    return new Set();
  }
}

/** Which Dashboard cards the person has hidden. Saved in this browser only. */
export function useHiddenSections() {
  const [hidden, setHidden] = useState<Set<string>>(load);

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = toggleSection(prev, id);
      try {
        localStorage.setItem(HIDDEN_SECTIONS_KEY, serializeHiddenSections(next));
      } catch {
        /* storage blocked: the choice still applies until reload */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setHidden(new Set());
    try {
      localStorage.removeItem(HIDDEN_SECTIONS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { hidden, show: (id: string) => !hidden.has(id), toggle, reset };
}
