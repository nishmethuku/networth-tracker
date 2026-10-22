import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import { fetchBudgetSummary } from "../../api";
import { projectNetWorth } from "../../utils/whatIfProjection";
import { savingsRate } from "../../utils/savingsRate";
import { formatCurrencyCompact } from "../../utils/formatters";

const RATES = [4, 6, 8];
const YEARS = [5, 10, 20];

/** A quick "where could I be" estimate. An illustration, not a prediction. */
export default function ProjectionCard({ currentNetWorth, currency, householdId }) {
  const [rate, setRate] = useState(6);
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });

  const monthly = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const r = savingsRate(summary?.months, key);
    return r && r.avgMonthlyNet > 0 ? r.avgMonthlyNet : 0;
  }, [summary]);

  const points = useMemo(
    () => projectNetWorth({ startingAmount: Math.max(currentNetWorth, 0), monthlyContribution: monthly, annualRatePct: rate, years: 20 }),
    [currentNetWorth, monthly, rate],
  );

  if (!(currentNetWorth > 0)) return null;

  return (
    <Card
      title="Where you could be"
      subtitle={
        monthly > 0
          ? `If you keep saving about ${formatCurrencyCompact(monthly, currency)} a month`
          : "If you add nothing new and your investments grow"
      }
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <label htmlFor="projection-rate" style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Yearly growth
        </label>
        <select
          id="projection-rate"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          style={{
            padding: "0.3rem 0.6rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
        {YEARS.map((y) => (
          <div key={y} style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>In {y} years</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>
              {formatCurrencyCompact(points[y].value, currency)}
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0.75rem 0 0" }}>
        An illustration with steady growth, not a prediction.{" "}
        <Link to="/what-if" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
          Try your own numbers
        </Link>
      </p>
    </Card>
  );
}
