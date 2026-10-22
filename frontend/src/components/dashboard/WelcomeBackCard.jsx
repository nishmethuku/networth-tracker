import { useState } from "react";
import { useSinceLastVisit } from "../../hooks/useSinceLastVisit";
import { formatCurrencyCompact, todayISO } from "../../utils/formatters";

/** One friendly line on the first visit of a day: what changed since the last one. */
export default function WelcomeBackCard({ current, currency }) {
  const since = useSinceLastVisit(current, todayISO());
  const [closed, setClosed] = useState(false);
  if (!since || closed) return null;

  const up = since.delta >= 0;
  const when = since.daysAgo === 1 ? "yesterday" : `${since.daysAgo} days ago`;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "0.75rem 1rem",
        marginBottom: "1.5rem",
        color: "var(--text)",
      }}
    >
      <span>
        Welcome back. Since you last looked ({when}), your net worth is{" "}
        <strong style={{ color: up ? "var(--success)" : "var(--danger)" }}>
          {up ? "up" : "down"} {formatCurrencyCompact(Math.abs(since.delta), currency)}
          {since.pct != null ? ` (${Math.abs(since.pct).toFixed(1)}%)` : ""}
        </strong>
        .
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setClosed(true)}
        style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.125rem" }}
      >
        ✕
      </button>
    </div>
  );
}
