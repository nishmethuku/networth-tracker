import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Search your portfolio" },
  { keys: ["N"], description: "Add a new holding" },
  { keys: ["H"], description: "Go to Home" },
  { keys: ["P"], description: "Go to Portfolio" },
  { keys: ["T"], description: "Go to Transactions" },
  { keys: ["Esc"], description: "Close any open panel" },
  { keys: ["?"], description: "Show this help" },
];

function Kbd({ children }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 24,
        padding: "0.2rem 0.4rem",
        borderRadius: "6px",
        border: "1px solid var(--border-dark)",
        background: "var(--bg-secondary)",
        color: "var(--text)",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {children}
    </kbd>
  );
}

export default function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 249 }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 250,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              padding: "1.5rem",
              width: "min(360px, 90vw)",
            }}
          >
            <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>Keyboard shortcuts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {SHORTCUTS.map((s) => (
                <div key={s.description} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{s.description}</span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
