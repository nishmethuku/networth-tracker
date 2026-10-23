import { useQuery } from "@tanstack/react-query";
import Card from "../Card";
import { fetchBudgetYear } from "../../api";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { formatCurrencyForDisplay } from "../../utils/formatters";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar year of spending in one glance: a bar per month, the total, and the biggest categories. */
export default function YearReview({ currency, householdId }) {
  const year = new Date().getFullYear();
  const { data } = useQuery({
    queryKey: ["budget-year", currency, householdId, year],
    queryFn: () => fetchBudgetYear({ householdId, year, currency }),
    staleTime: 60_000,
  });
  if (!data || !(data.total_spent > 0)) return null;
  const money = (v) => formatCurrencyForDisplay(v, currency, { includeCode: false });
  const max = Math.max(...data.months.map((m) => m.expenses), 1);
  const diff = data.last_year_spent ? data.total_spent - data.last_year_spent : null;

  return (
    <Card title={`${year} so far`} subtitle={`${money(data.total_spent)} spent, about ${money(data.average_month)} a month`}>
      <div
        role="img"
        aria-label={`Spending by month in ${year}`}
        style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "6rem", marginTop: "0.75rem" }}
      >
        {data.months.map((m, i) => (
          <div
            key={m.month}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
          >
            <div
              title={`${MONTHS[i]}: ${money(m.expenses)}`}
              style={{
                width: "100%",
                height: m.expenses > 0 ? `${Math.max(4, (m.expenses / max) * 100)}%` : "2px",
                borderRadius: "4px 4px 0 0",
                background:
                  data.biggest_month?.month === m.month ? "var(--primary)" : "color-mix(in srgb, var(--primary) 35%, transparent)",
              }}
            />
            <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", marginTop: "2px" }}>{MONTHS[i][0]}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "var(--text)" }}>
        {data.biggest_month
          ? `Your biggest month was ${MONTHS[Number(data.biggest_month.month.slice(5)) - 1]} at ${money(data.biggest_month.expenses)}.`
          : ""}
        {diff !== null ? ` That is ${money(Math.abs(diff))} ${diff >= 0 ? "more" : "less"} than all of last year so far.` : ""}
      </p>
      {data.top_categories.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }} aria-label={`Top categories in ${year}`}>
          {data.top_categories.slice(0, 5).map((c) => (
            <li
              key={c.category}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.3rem 0",
                borderTop: "1px solid var(--border-light)",
                fontSize: "0.875rem",
                color: "var(--text)",
              }}
            >
              <span>{getBudgetCategoryLabel(c.category)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{money(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
