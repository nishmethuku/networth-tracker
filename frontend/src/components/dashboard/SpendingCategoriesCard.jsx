import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import { fetchBudgetSummary } from "../../api";
import { topCategories } from "../../utils/spendingCategories";
import { groupBreakdown } from "../../utils/categoryTree";
import { formatCurrencyCompact } from "../../utils/formatters";

function label(category) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** The biggest spending categories in the latest budget month, as simple bars. Hidden when there is no spending. */
export default function SpendingCategoriesCard({ currency, householdId }) {
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });

  const rows = useMemo(
    () =>
      topCategories(
        groupBreakdown(summary?.category_breakdown).map((g) => ({ category: g.category, amount: g.total })),
        5,
      ),
    [summary],
  );
  if (rows.length === 0) return null;

  return (
    <Card title="Where your spending goes" subtitle="Biggest categories in your latest budget month">
      <ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, display: "grid", gap: "0.6rem" }}>
        {rows.map((r) => (
          <li key={r.category}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", gap: "0.5rem" }}>
              <span>{label(r.category)}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                {formatCurrencyCompact(r.amount, currency)} · {Math.round(r.sharePct)}%
              </span>
            </div>
            <div
              aria-hidden="true"
              style={{ height: "0.4rem", background: "var(--border)", borderRadius: "999px", marginTop: "0.25rem", overflow: "hidden" }}
            >
              <div style={{ width: `${r.sharePct}%`, height: "100%", background: "var(--text-secondary)" }} />
            </div>
          </li>
        ))}
      </ul>
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem" }}>
        <Link to="/budget" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
          Open budget
        </Link>
      </p>
    </Card>
  );
}
