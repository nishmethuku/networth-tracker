/**
 * Loading state component - reusable spinner
 */
export default function LoadingState({ message = "Loading..." }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        color: "var(--text-secondary)",
        minHeight: "400px",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          border: "4px solid var(--border)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "1.5rem",
        }}
      />
      <p style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-secondary)" }}>{message}</p>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
