/**
 * Reusable confirmation modal for delete operations
 */
export default function ConfirmDeleteModal({ isOpen, onConfirm, onCancel, assetName, title = "Delete Asset?" }) {
  if (!isOpen) return null;

  return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: "var(--card)",
            padding: "2rem",
            borderRadius: "var(--radius-md)",
            maxWidth: "450px",
            width: "90%",
            boxShadow: "var(--shadow-lg)",
            border: "1px solid var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: "1rem", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{title}</h3>
          <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            Are you sure you want to delete <strong>{assetName}</strong>? This action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              onClick={onCancel}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "0.9375rem",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--bg-secondary)";
                e.target.style.borderColor = "var(--border-dark)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "var(--bg)";
                e.target.style.borderColor = "var(--border)";
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "var(--radius)",
                background: "var(--danger)",
                color: "var(--text-inverse)",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.9375rem",
                transition: "all 0.2s ease",
                boxShadow: "var(--shadow)",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "var(--danger-light)";
                e.target.style.color = "var(--danger)";
                e.target.style.transform = "translateY(-1px)";
                e.target.style.boxShadow = "var(--shadow-md)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "var(--danger)";
                e.target.style.color = "var(--text-inverse)";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "var(--shadow)";
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
  );
}
