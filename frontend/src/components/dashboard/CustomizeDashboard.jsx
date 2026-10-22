import { useState } from "react";
import { DASHBOARD_SECTIONS } from "../../utils/dashboardSections";

/** A small "Customize" button that opens a checklist of Dashboard cards. */
export default function CustomizeDashboard({ hidden, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: "1rem" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "0.4rem 0.875rem",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--text)",
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        {open ? "Done" : "Customize"}
      </button>
      {open && (
        <fieldset
          style={{
            marginTop: "0.75rem",
            padding: "1rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--card)",
          }}
        >
          <legend style={{ padding: "0 0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Choose which cards to show</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
            {DASHBOARD_SECTIONS.map((s) => (
              <label
                key={s.id}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text)", fontSize: "0.9375rem" }}
              >
                <input type="checkbox" checked={!hidden.has(s.id)} onChange={() => onToggle(s.id)} />
                {s.label}
              </label>
            ))}
          </div>
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={onReset}
              style={{
                marginTop: "0.75rem",
                background: "none",
                border: "none",
                color: "var(--text)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Show everything again
            </button>
          )}
        </fieldset>
      )}
    </div>
  );
}
