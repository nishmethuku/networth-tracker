import { togglePrivacy, usePrivacy } from "../utils/privacy";

/** Hides or shows every money amount, for when the screen is visible to others. */
export default function PrivacyToggle() {
  const on = usePrivacy();
  return (
    <button
      onClick={togglePrivacy}
      aria-pressed={on}
      aria-label={on ? "Show amounts" : "Hide amounts"}
      title={on ? "Show amounts" : "Hide amounts (for screen sharing)"}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: on ? "var(--primary-light)" : "var(--card)",
        color: "var(--text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.875rem",
        fontWeight: 500,
      }}
    >
      <span aria-hidden="true">{on ? "🙈" : "👁️"}</span>
      <span>{on ? "Show amounts" : "Hide amounts"}</span>
    </button>
  );
}
