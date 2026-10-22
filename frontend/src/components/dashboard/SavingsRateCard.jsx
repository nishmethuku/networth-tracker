import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import { fetchBudgetSummary } from "../../api";
import { savingsRate } from "../../utils/savingsRate";
import { formatCurrencyCompact } from "../../utils/formatters";

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** How much of your income you keep, from the Budget page entries. Hidden until there is income logged. */
export default function SavingsRateCard({ currency, householdId }) {
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });

  const result = useMemo(() => savingsRate(summary?.months, monthKey()), [summary]);
  if (!result) return null;

  const good = result.ratePct >= 20;
  const color = result.ratePct < 0 ? "var(--danger)" : good ? "var(--success)" : "var(--text)";

  return (
    <Card
      title="Savings rate"
      subtitle={`Share of income you kept over the last ${result.monthsUsed} month${result.monthsUsed === 1 ? "" : "s"}`}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "2.25rem", fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{Math.round(result.ratePct)}%</span>
        <span style={{ color: "var(--text-secondary)" }}>
          {result.avgMonthlyNet >= 0 ? "about " : "about −"}
          {formatCurrencyCompact(Math.abs(result.avgMonthlyNet), currency)} a month
        </span>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0.75rem 0 0" }}>
        {result.ratePct < 0
          ? "You spent more than you earned in this period."
          : good
            ? "At or above the common 20% rule of thumb."
            : "Many people aim for 20% or more."}{" "}
        <Link to="/budget" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
          Open budget
        </Link>
      </p>
    </Card>
  );
}
