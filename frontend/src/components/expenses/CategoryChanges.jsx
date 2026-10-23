import { useMemo } from "react";
import Card from "../Card";
import { categoryChanges } from "../../utils/categoryChanges";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";

/** The categories that moved the most compared with last month (same days while the month is in progress). */
export default function CategoryChanges({ entries, month, currency, onPick }) {
  const rows = useMemo(() => categoryChanges(entries, month, todayISO(), currency), [entries, month, currency]);
  if (rows.length === 0) return null;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });

  return (
    <Card title="What changed vs last month" subtitle="Biggest moves by category">
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
        {rows.map((r) => (
          <li
            key={r.category}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              padding: "0.35rem 0",
              fontSize: "0.9375rem",
              color: "var(--text)",
            }}
          >
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(r.category)}
                aria-label={`Show only ${getBudgetCategoryLabel(r.category)}`}
                style={{ background: "none", border: "none", padding: 0, color: "var(--primary)", cursor: "pointer", font: "inherit" }}
              >
                {getBudgetCategoryLabel(r.category)}
              </button>
            ) : (
              <span>{getBudgetCategoryLabel(r.category)}</span>
            )}
            <span style={{ fontFamily: "var(--font-mono)", color: r.delta > 0 ? "var(--danger)" : "var(--success)" }}>
              {r.delta > 0 ? "▲ " : "▼ "}
              {money(Math.abs(r.delta))}
              {r.pct !== null ? ` (${Math.round(Math.abs(r.pct))}%)` : " (new)"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
