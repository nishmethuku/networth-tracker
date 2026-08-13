import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global single-key navigation shortcuts. Cmd/Ctrl+K (search) lives in
 * CommandSearch.jsx since it needs its own modal state; this hook covers
 * the plain single-key shortcuts that only need to navigate or toggle help.
 */
export default function useKeyboardShortcuts({ onShowHelp } = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          navigate("/add-holding");
          break;
        case "h":
          e.preventDefault();
          navigate("/");
          break;
        case "p":
          e.preventDefault();
          navigate("/portfolio");
          break;
        case "t":
          e.preventDefault();
          navigate("/transactions");
          break;
        case "?":
          e.preventDefault();
          onShowHelp?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, onShowHelp]);
}
