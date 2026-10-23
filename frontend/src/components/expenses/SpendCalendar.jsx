import { useMemo } from "react";
import Card from "../Card";
import { buildCalendar } from "../../utils/spendCalendar";
import { formatCurrencyForDisplay, formatDateISO } from "../../utils/formatters";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const SHADE = ["transparent", "rgba(37, 99, 235, 0.18)", "rgba(37, 99, 235, 0.35)", "rgba(37, 99, 235, 0.55)", "rgba(37, 99, 235, 0.8)"];

/** A month of days shaded by how much was spent. Tap a day to see just that day. */
export default function SpendCalendar({ entries, month, currency, selected, onSelect }) {
  const weeks = useMemo(() => buildCalendar(entries, month, currency), [entries, month, currency]);
  if (!entries || entries.length === 0) return null;

  return (
    <Card title="Spending calendar" subtitle="Darker days are the bigger ones. Tap a day to see only that day.">
      <div role="grid" aria-label="Spending calendar" style={{ display: "grid", gap: "4px", marginTop: "0.75rem", maxWidth: "26rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }} aria-hidden="true">
          {DAYS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} role="row" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
            {w.map((c, ci) =>
              c.date ? (
                <button
                  key={ci}
                  type="button"
                  role="gridcell"
                  aria-pressed={selected === c.date}
                  aria-label={`${formatDateISO(c.date)}: ${c.total > 0 ? formatCurrencyForDisplay(c.total, currency, { includeCode: false }) : "nothing spent"}`}
                  onClick={() => onSelect(selected === c.date ? null : c.date)}
                  style={{
                    aspectRatio: "1",
                    borderRadius: "6px",
                    border: selected === c.date ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: SHADE[c.level],
                    color: "var(--text)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {Number(c.date.slice(8, 10))}
                </button>
              ) : (
                <div key={ci} role="gridcell" aria-hidden="true" />
              ),
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
