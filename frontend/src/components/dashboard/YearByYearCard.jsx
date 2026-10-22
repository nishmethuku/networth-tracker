import { useMemo } from "react";
import Card from "../Card";
import { yearlySummary } from "../../utils/yearlySummary";
import { formatCurrencyCompact } from "../../utils/formatters";

/** Year-end net worth and the change each year, from saved history. */
export default function YearByYearCard({ history, currency }) {
  const rows = useMemo(() => yearlySummary(history, new Date().getFullYear()), [history]);
  if (rows.length < 2) return null;

  return (
    <Card title="Year by year" subtitle="Net worth at the end of each year">
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.9375rem" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
            <th scope="col" style={{ padding: "0.35rem 0" }}>
              Year
            </th>
            <th scope="col" style={{ padding: "0.35rem 0", textAlign: "right" }}>
              Net worth
            </th>
            <th scope="col" style={{ padding: "0.35rem 0", textAlign: "right" }}>
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year} style={{ borderTop: "1px solid var(--border-light)", color: "var(--text)" }}>
              <td style={{ padding: "0.5rem 0" }}>
                {r.year}
                {r.partial ? " (so far)" : ""}
              </td>
              <td style={{ padding: "0.5rem 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                {formatCurrencyCompact(r.endValue, currency)}
              </td>
              <td
                style={{
                  padding: "0.5rem 0",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  color: r.delta == null ? "var(--text-secondary)" : r.delta >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {r.delta == null
                  ? "—"
                  : `${r.delta >= 0 ? "+" : "−"}${formatCurrencyCompact(Math.abs(r.delta), currency)}${
                      r.pct != null ? ` (${r.pct >= 0 ? "+" : "−"}${Math.abs(r.pct).toFixed(0)}%)` : ""
                    }`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
