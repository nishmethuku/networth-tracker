import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { aiSearch, ApiError } from "../../api";

/**
 * Cmd/Ctrl+K opens a natural-language portfolio search. The query goes to
 * Claude, which returns a structured filter spec (asset types, value/gain
 * ranges, gainers/losers, a loose text match) — applied entirely
 * client-side against the holdings the Portfolio page already has loaded,
 * via matchesFilterSpec in Portfolio.jsx.
 */
export default function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiSearch(trimmed);
      if (!res.configured) {
        setError("AI search isn't configured yet — an Anthropic API key needs to be added on the backend first.");
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
            <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", padding: "0.5rem 0.75rem", borderBottom: error ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: "1.125rem", marginRight: "0.5rem" }}>🔎</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your portfolio… e.g. 'crypto holdings that are up'"
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
              <kbd style={{ fontSize: "0.6875rem", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "4px", padding: "0.1rem 0.35rem" }}>Esc</kbd>
            </form>
            {error && (
              <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "var(--danger)" }}>{error}</div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
