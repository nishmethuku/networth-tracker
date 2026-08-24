import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "../contexts/ToastContext";

const COLORS = {
  success: "var(--success)",
  error: "var(--danger)",
  info: "var(--primary)",
};

function ToastItem({ toast, onDismiss }) {
  const bg = COLORS[toast.type] || COLORS.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, transition: { duration: 0.15 } }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.6 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80) onDismiss(toast.id);
      }}
      style={{
        position: "relative",
        overflow: "hidden",
        background: bg,
        color: "var(--text-inverse)",
        padding: "0.875rem 1.25rem",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        minWidth: "260px",
        maxWidth: "400px",
        fontWeight: 500,
        fontSize: "0.9375rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        cursor: "grab",
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-inverse)",
          fontSize: "1.25rem",
          cursor: "pointer",
          opacity: 0.85,
          lineHeight: 1,
        }}
      >
        ×
      </button>
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: toast.duration / 1000, ease: "linear" }}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 3,
          width: "100%",
          background: "rgba(255,255,255,0.5)",
          transformOrigin: "left",
        }}
      />
    </motion.div>
  );
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      style={{
        position: "fixed",
        top: "1.25rem",
        right: "1.25rem",
        zIndex: 400,
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
      }}
      className="toast-container"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
