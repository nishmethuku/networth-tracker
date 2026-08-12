import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--card)",
        color: "var(--text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.875rem",
        fontWeight: 500,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--card-hover)";
        e.currentTarget.style.borderColor = "var(--border-dark)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--card)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <>
          <span>🌙</span>
          <span>Dark</span>
        </>
      ) : (
        <>
          <span>☀️</span>
          <span>Light</span>
        </>
      )}
    </button>
  );
}
