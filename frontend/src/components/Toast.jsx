/**
 * Toast notification component
 */
import { useEffect } from "react";

export default function Toast({ message, type = "success", isVisible, onClose }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const bgColor = type === "success" ? "var(--success)" : "var(--danger)";
  const textColor = "var(--text-inverse)";

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        background: bgColor,
        color: textColor,
        padding: "1rem 1.5rem",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        border: "1px solid var(--border)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        minWidth: "280px",
        maxWidth: "400px",
        animation: "slideIn 0.3s ease-out",
        fontWeight: 500,
        fontSize: "0.9375rem",
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color: textColor,
          fontSize: "1.5rem",
          cursor: "pointer",
          padding: "0",
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.2s ease",
          opacity: 0.8,
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255,255,255,0.2)";
          e.target.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
          e.target.style.opacity = "0.8";
        }}
      >
        ×
      </button>
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
}
