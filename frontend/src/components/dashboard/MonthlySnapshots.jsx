import { useMemo, useState } from "react";
import { formatCurrencyForDisplay } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";
import EmptyState from "../EmptyState";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function formatMonthLabel(dateStr) {
  // Parse as a plain calendar date (no timezone conversion) so this always
  // reads as the day that was actually snapshotted.
  const [y, m, d] = dateStr.split("-").map(Number);
  return MONTH_LABEL.format(new Date(y, m - 1, d));
}

/**
 * One row per month — net worth on the snapshot closest to the 1st of that
 * month, expandable to the same by_asset_type breakdown already stored on
 * every daily snapshot (see snapshot_service.py). Built entirely from the
 * daily history already fetched for the net worth chart — no separate
 * backend endpoint needed.
 */
export default function MonthlySnapshots({ history, currency }) {
  const [expanded, setExpanded] = useState(null); // snapshot date string, or null

  const monthly = useMemo(() => {
    if (!history) return [];
    const byMonth = {};
    for (const row of history) {
      const monthKey = row.date.slice(0, 7); // "YYYY-MM"
      const day = Number(row.date.slice(8, 10));
      const existing = byMonth[monthKey];
      if (!existing || day < existing.day) {
        byMonth[monthKey] = { ...row, day };
      }
    }
    return Object.values(byMonth).sort((a, b) => b.date.localeCompare(a.date));
  }, [history]);

  if (monthly.length === 0) {
    return <EmptyState message="No snapshots yet — these build up once the daily tracking job has run for a bit." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: 420, overflowY: "auto" }}>
      {monthly.map((m, i) => {
        const isOpen = expanded === m.date;
        const breakdown = Object.entries(m.byAssetType || {}).sort((a, b) => b[1] - a[1]);
        return (
          <div key={m.date} style={{ borderBottom: i < monthly.length - 1 ? "1px solid var(--border-light)" : "none" }}>
            <div
              onClick={() => setExpanded(isOpen ? null : m.date)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.625rem 0",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
                {formatMonthLabel(m.date)}
                {m.day > 5 && (
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>(as of the {m.day}{m.day === 1 ? "st" : "th"})</span>
                )}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: m.netWorth < 0 ? "var(--danger)" : "var(--text)" }}>
                {formatCurrencyForDisplay(m.netWorth, currency, { includeCode: false })}
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: "0 0 0.75rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {breakdown.length === 0 ? (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No breakdown recorded for this snapshot.</span>
                ) : (
                  breakdown.map(([type, value]) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{getAssetTypeLabel(type)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: value < 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                        {formatCurrencyForDisplay(value, currency, { includeCode: false })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
