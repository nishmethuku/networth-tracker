/**
 * Error state component - reusable error display with retry option
 */
export default function ErrorState({ error, onRetry, message = "Failed to load data" }) {
  const errorMessage = error?.message || error || message;

  return (
    <div
      style={{
        padding: "2.5rem",
        background: "var(--card)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--danger)",
        textAlign: "center",
        boxShadow: "var(--shadow)",
        maxWidth: "500px",
        margin: "2rem auto",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
      <p style={{ color: "var(--danger)", marginBottom: "1.5rem", fontSize: "1rem", fontWeight: 500 }}>{errorMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9375rem",
            transition: "all 0.2s ease",
            boxShadow: "var(--shadow)",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "var(--primary-hover)";
            e.target.style.transform = "translateY(-2px)";
            e.target.style.boxShadow = "var(--shadow-md)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "var(--primary)";
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "var(--shadow)";
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
