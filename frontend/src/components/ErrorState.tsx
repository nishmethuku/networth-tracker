interface ErrorLike {
  message?: string;
}

interface ErrorStateProps {
  error?: ErrorLike | string | null;
  onRetry?: () => void;
  message?: string;
}

/**
 * Error state component - reusable error display with retry option
 */
export default function ErrorState({ error, onRetry, message = "Failed to load data" }: ErrorStateProps) {
  const errorMessage = (typeof error === "string" ? error : error?.message) || message;

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
            e.currentTarget.style.background = "var(--primary-hover)";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "var(--shadow-md)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--primary)";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "var(--shadow)";
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
