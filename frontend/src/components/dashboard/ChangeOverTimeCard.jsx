import { useMemo } from "react";
import { Link } from "react-router-dom";
import Card from "../Card";
import { netWorthChange } from "../../utils/netWorthChange";
import { formatCurrencyCompact, todayISO } from "../../utils/formatters";

const WINDOWS = [
  { days: 7, label: "This week" },
  { days: 30, label: "This month" },
  { days: 90, label: "3 months" },
  { days: 365, label: "This year" },
];

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Net worth change over several windows. A window shows only when a saved snapshot lies close to its start, so a week is never measured from a monthly point. */
export default function ChangeOverTimeCard({ history, current, currency }) {
  const rows = useMemo(() => {
    const today = todayISO();
    return WINDOWS.map((w) => ({ ...w, change: netWorthChange(history, current, w.days, today) })).filter(
      (r) => r.change && daysBetween(r.change.fromDate, today) <= r.days * 1.5 + 3,
    );
  }, [history, current]);

  if (rows.length === 0) return null;

  return (
    <Card title="How you are doing" subtitle="Net worth change since each point in time">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginTop: "0.75rem" }}>
        {rows.map(({ days, label, change }) => {
          const up = change.delta >= 0;
          return (
            <div key={days} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: up ? "var(--success)" : "var(--danger)" }}>
                {up ? "+" : "−"}
                {formatCurrencyCompact(Math.abs(change.delta), currency)}
              </div>
              {change.pct != null && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {up ? "+" : "−"}
                  {Math.abs(change.pct).toFixed(1)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
        <Link to="/review" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "underline" }}>
          See your year in review →
        </Link>
      </div>
    </Card>
  );
}
