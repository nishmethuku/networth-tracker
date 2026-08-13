import { AnimatePresence, motion } from "framer-motion";
import useIsMobile from "../hooks/useIsMobile";

/**
 * Reusable confirmation modal for delete operations. Below 640px this
 * renders as a bottom sheet (slides up, drag-to-dismiss) instead of a
 * centered modal — matches how native mobile UIs surface confirmations.
 */
export default function ConfirmDeleteModal({ isOpen, onConfirm, onCancel, assetName, title = "Delete Asset?" }) {
  const isMobile = useIsMobile();

  const Buttons = (
    <div style={{ display: "flex", gap: "0.75rem", justifyContent: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
      <button
        onClick={onCancel}
        style={{
          padding: "0.75rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: "0.9375rem",
        }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        style={{
          padding: "0.75rem 1.25rem",
          borderRadius: "var(--radius)",
          background: "var(--danger)",
          color: "var(--text-inverse)",
          border: "none",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.9375rem",
          boxShadow: "var(--shadow)",
        }}
      >
        Delete
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, backdropFilter: "blur(4px)" }}
          />
          {isMobile ? (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) onCancel();
              }}
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1001,
                background: "var(--card)",
                borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                padding: "0.75rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px))",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-dark)", margin: "0 auto 1rem" }} />
              <h3 style={{ marginBottom: "0.75rem", fontSize: "1.125rem", fontWeight: 700, color: "var(--text)" }}>{title}</h3>
              <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Are you sure you want to delete <strong>{assetName}</strong>? This action cannot be undone.
              </p>
              {Buttons}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={onCancel}
              style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "var(--card)",
                  padding: "2rem",
                  borderRadius: "var(--radius-md)",
                  maxWidth: "450px",
                  width: "90%",
                  boxShadow: "var(--shadow-lg)",
                  border: "1px solid var(--border)",
                }}
              >
                <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{title}</h3>
                <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                  Are you sure you want to delete <strong>{assetName}</strong>? This action cannot be undone.
                </p>
                {Buttons}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
