/**
 * Empty state component - shows when there's no data
 */
export default function EmptyState({ message, action }) {
  return (
    <div
      style={{
        padding: "3rem 2rem",
        textAlign: "center",
        color: "var(--text-secondary)",
        background: "var(--card)",
        borderRadius: "var(--radius-md)",
        border: "1px dashed var(--border)",
        maxWidth: "500px",
        margin: "2rem auto",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.7 }}>📭</div>
      <p style={{ fontSize: "1.0625rem", marginBottom: "1rem", fontWeight: 500, color: "var(--text)" }}>{message}</p>
      {action && <div style={{ marginTop: "1.5rem" }}>{action}</div>}
    </div>
  );
}
