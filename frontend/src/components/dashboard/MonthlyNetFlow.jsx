import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrencyForDisplay } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";
import { fetchMonthlyFlow } from "../../api";
import EmptyState from "../EmptyState";
import LoadingState from "../LoadingState";

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return MONTH_LABEL.format(new Date(y, m - 1, 1));
}

/**
 * How much money moved into/out of each asset type per month — distinct
 * from Monthly Snapshots, which shows the type's total value on a given
 * day. A buy/sell on a stock is exact (from the transaction ledger); a
 * change in a valuation-based holding (real estate, cash, etc.) is the
 * best available proxy since there's no separate ledger for those, so it
 * blends real contributions with market movement. See
 * holdings_service.get_monthly_net_flow for the full explanation.
 */
export default function MonthlyNetFlow({ currency }) {
  const [expanded, setExpanded] = useState(null); // month string, or null

  const { data: rows, isLoading } = useQuery({
    queryKey: ["monthly-flow", currency],
    queryFn: () => fetchMonthlyFlow({ currency, months: 12 }),
  });

  if (isLoading) return <LoadingState message="Loading net flow..." />;

  const months = [...(rows || [])].sort((a, b) => b.month.localeCompare(a.month));

  if (months.length === 0) {
    return <EmptyState message="No activity yet — this fills in as you log transactions and value updates." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: 420, overflowY: "auto" }}>
      {months.map((m, i) => {
        const isOpen = expanded === m.month;
        const breakdown = Object.entries(m.byAssetType || {}).sort((a, b) => b[1] - a[1]);
        return (
          <div key={m.month} style={{ borderBottom: i < months.length - 1 ? "1px solid var(--border-light)" : "none" }}>
            <div
              onClick={() => setExpanded(isOpen ? null : m.month)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", cursor: "pointer" }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
                {formatMonthLabel(m.month)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: m.totalFlow < 0 ? "var(--danger)" : "var(--success)" }}>
                {m.totalFlow >= 0 ? "+" : ""}{formatCurrencyForDisplay(m.totalFlow, currency, { includeCode: false })}
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: "0 0 0.75rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {breakdown.length === 0 ? (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No activity recorded this month.</span>
                ) : (
                  breakdown.map(([type, value]) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{getAssetTypeLabel(type)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: value < 0 ? "var(--danger)" : "var(--success)" }}>
                        {value >= 0 ? "+" : ""}{formatCurrencyForDisplay(value, currency, { includeCode: false })}
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
