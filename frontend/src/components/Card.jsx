export default function Card({ title, value, subtitle, children }) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow)",
        padding: "1.5rem",
        minHeight: "100px",
        border: "1px solid var(--border)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.borderColor = "var(--border-dark)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      {title && (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem" }}>{title}</div>
      )}

      {value && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.875rem",
            fontWeight: 600,
            color: "var(--primary)",
            marginTop: "0.25rem",
            lineHeight: "1.2",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      )}

      {subtitle && (
        <div style={{ color: "var(--text-secondary)", marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: "1.5" }}>{subtitle}</div>
      )}

      {children}
    </div>
  );
}
