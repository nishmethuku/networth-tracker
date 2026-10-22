import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { aiSearch, ApiError } from "../../api";
import { matchPages } from "../../utils/quickNav";

/**
 * Cmd/Ctrl+K opens a natural-language portfolio search. The query goes to
 * Claude, which returns a structured filter spec (asset types, value/gain
 * ranges, gainers/losers, a loose text match) — applied entirely
 * client-side against the holdings the Portfolio page already has loaded,
 * via matchesFilterSpec in Portfolio.jsx.
 */
function rowStyle(active) {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "0.5rem 0.75rem",
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: active ? "var(--primary-light)" : "transparent",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: "0.9375rem",
  };
}

export default function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const pages = matchPages(query);
  // Page matches first, then an always-present "Ask AI" row for anything else.
  const rowCount = pages.length + (query.trim() ? 1 : 0);

  useEffect(() => {
    function handleKeyDown(e) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isShortcut) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    if (selected < pages.length) {
      navigate(pages[selected].to);
      close();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await aiSearch(trimmed);
      if (!res.configured) {
        setError("AI search isn't configured yet — a Gemini API key needs to be added on the backend first.");
        return;
      }
      if (!res.filter_spec) {
        setError("Couldn't understand that query — try rephrasing.");
        return;
      }
      navigate("/portfolio", { state: { aiFilterSpec: res.filter_spec, aiFilterQuery: trimmed } });
      setOpen(false);
      setQuery("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 199 }}
          />
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed",
              top: "14vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(560px, 92vw)",
              background: "var(--card)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            <form
              id="command-search-form"
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.5rem 0.75rem",
                borderBottom: error ? "1px solid var(--border)" : "none",
              }}
            >
              <span style={{ fontSize: "1.125rem", marginRight: "0.5rem" }}>🔎</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && rowCount > 0) {
                    e.preventDefault();
                    setSelected((i) => (i + 1) % rowCount);
                  } else if (e.key === "ArrowUp" && rowCount > 0) {
                    e.preventDefault();
                    setSelected((i) => (i - 1 + rowCount) % rowCount);
                  }
                }}
                aria-label="Go to a page or ask about your portfolio"
                placeholder="Go to a page, or ask 'crypto holdings that are up'"
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text)",
                  fontSize: "0.9375rem",
                  padding: "0.625rem 0",
                }}
              />
              {loading && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Searching…</span>}
              <kbd
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  padding: "0.1rem 0.35rem",
                }}
              >
                Esc
              </kbd>
            </form>
            {query.trim() && (
              <ul
                role="listbox"
                aria-label="Results"
                style={{ listStyle: "none", margin: 0, padding: "0.25rem 0.5rem 0.5rem", borderTop: "1px solid var(--border)" }}
              >
                {pages.map((p, i) => (
                  <li key={p.to} role="option" aria-selected={selected === i}>
                    <button
                      type="button"
                      onMouseEnter={() => setSelected(i)}
                      onClick={() => {
                        navigate(p.to);
                        close();
                      }}
                      style={rowStyle(selected === i)}
                    >
                      <span>Go to {p.title}</span>
                    </button>
                  </li>
                ))}
                <li role="option" aria-selected={selected === pages.length}>
                  <button
                    type="submit"
                    form="command-search-form"
                    onMouseEnter={() => setSelected(pages.length)}
                    style={rowStyle(selected === pages.length)}
                  >
                    <span>Ask AI: “{query.trim()}”</span>
                  </button>
                </li>
              </ul>
            )}
            {error && <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "var(--danger)" }}>{error}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
