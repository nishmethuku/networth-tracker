import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Card from "../Card";
import InfoTip from "../InfoTip";
import { fetchBudgetSummary } from "../../api";
import { financialIndependence } from "../../utils/financialIndependence";
import { savingsRate } from "../../utils/savingsRate";
import { formatCurrencyCompact } from "../../utils/formatters";

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** How close you are to a rough "work is optional" number. Hidden until the Budget has spending. */
export default function FinancialIndependenceCard({ netWorth, currency, householdId }) {
  const { data: summary } = useQuery({
    queryKey: ["budget-summary", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 6, currency, householdId }),
  });

  const result = useMemo(() => {
    const key = monthKey();
    const sr = savingsRate(summary?.months, key);
    return financialIndependence(summary?.months, key, netWorth, sr && sr.avgMonthlyNet > 0 ? sr.avgMonthlyNet : 0);
  }, [summary, netWorth]);

  if (!result) return null;

  const pct = Math.round(result.progressPct);
  return (
    <Card
      title={
        <>
          Financial independence
          <InfoTip term="fiNumber" />
        </>
      }
      subtitle={`About 25 times your yearly spending of ${formatCurrencyCompact(result.monthlySpending * 12, currency)}`}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "2.25rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pct}%</span>
        <span style={{ color: "var(--text-secondary)" }}>of {formatCurrencyCompact(result.target, currency)}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Progress toward financial independence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ height: "0.5rem", background: "var(--border)", borderRadius: "999px", marginTop: "0.75rem", overflow: "hidden" }}
      >
        <div style={{ width: `${result.progressPct}%`, height: "100%", background: "var(--success)" }} />
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0.75rem 0 0" }}>
        {result.yearsToGo === 0
          ? "You are at or past this number."
          : result.yearsToGo === null
            ? "At your current saving pace this is more than 60 years away. Saving more or spending less moves it closer."
            : `At your current saving pace and 6% growth, about ${result.yearsToGo} year${result.yearsToGo === 1 ? "" : "s"} to go.`}{" "}
        <Link to="/budget" style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}>
          Open budget
        </Link>
      </p>
    </Card>
  );
}
