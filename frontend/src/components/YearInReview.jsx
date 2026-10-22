import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchNetWorthHistory, fetchHoldings, fetchMilestones, fetchIncomeSummary } from "../api";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyCompact } from "../utils/formatters";
import { buildYearReview } from "../utils/yearInReview";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long" });
function monthName(ym) {
  const [y, m] = ym.split("-").map(Number);
  return MONTH.format(new Date(y, m - 1, 1));
}

function Stat({ label, children }) {
  return (
    <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)", padding: "1rem" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)", fontSize: "1.125rem" }}>{children}</div>
    </div>
  );
}

/** A plain, friendly recap of one calendar year. */
export default function YearInReview() {
  const { currentHouseholdId } = useHousehold();
  const currency = getDefaultDisplayCurrency();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const { data: history, isLoading } = useQuery({
    queryKey: ["net-worth-history", currency, currentHouseholdId],
    queryFn: () => fetchNetWorthHistory(currentHouseholdId, currency),
  });
  const { data: holdings } = useQuery({
    queryKey: ["holdings", "summary", currency, currentHouseholdId],
    queryFn: () => fetchHoldings({ currency, summary: true, householdId: currentHouseholdId }),
  });
  const { data: milestones } = useQuery({
    queryKey: ["milestones", currentHouseholdId],
    queryFn: () => fetchMilestones({ householdId: currentHouseholdId }),
  });
  const { data: income } = useQuery({
    queryKey: ["income-summary", currency, currentHouseholdId],
    queryFn: () => fetchIncomeSummary(currency, currentHouseholdId),
  });

  const review = useMemo(
    () =>
      buildYearReview({
        year,
        history,
        holdings: (holdings || []).map((h) => ({
          label: h.symbol || h.name || "A holding",
          value: h.displayValue || 0,
          gain: h.displayTotalGain ?? h.displayGain ?? null,
        })),
        milestones: (milestones || []).filter(Boolean),
        incomeByYear: income?.byYear,
      }),
    [year, history, holdings, milestones, income],
  );

  const years = useMemo(() => {
    const first = history && history.length ? Number(history[0].date.slice(0, 4)) : thisYear;
    const list = [];
    for (let y = thisYear; y >= first; y--) list.push(y);
    return list;
  }, [history, thisYear]);

  const money = (n) => formatCurrencyCompact(Math.abs(n), currency);
  const sign = (n) => (n >= 0 ? "+" : "−");

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Year in Review</h1>
        <button
          type="button"
          className="no-print"
          onClick={() => window.print()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Print or save as PDF
        </button>
        {years.length > 1 && (
          <select
            className="no-print"
            aria-label="Year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--text)",
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <LoadingState message="Building your recap..." />
      ) : !review ? (
        <EmptyState message={`Not enough saved history for ${year} yet. Your recap shows up once there are at least two saved points.`} />
      ) : (
        <>
          <Card title={`${year} in one line`}>
            <p style={{ fontSize: "1.25rem", color: "var(--text)", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
              Your net worth went from <strong>{money(review.startValue)}</strong> to <strong>{money(review.endValue)}</strong>
              {", "}
              <strong style={{ color: review.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                {sign(review.delta)}
                {money(review.delta)}
                {review.pct != null ? ` (${sign(review.pct)}${Math.abs(review.pct).toFixed(1)}%)` : ""}
              </strong>
              .
            </p>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
            {review.bestMonth && (
              <Stat label="Best month">
                {monthName(review.bestMonth.month)} ({sign(review.bestMonth.delta)}
                {money(review.bestMonth.delta)})
              </Stat>
            )}
            {review.worstMonth && (
              <Stat label="Toughest month">
                {monthName(review.worstMonth.month)} ({sign(review.worstMonth.delta)}
                {money(review.worstMonth.delta)})
              </Stat>
            )}
            {review.topGainer && year === thisYear && (
              <Stat label="Biggest all-time gain you hold">
                {review.topGainer.label} (+{money(review.topGainer.gain)})
              </Stat>
            )}
            {review.biggestHolding && year === thisYear && (
              <Stat label="Largest holding now">
                {review.biggestHolding.label} ({review.biggestHolding.sharePct.toFixed(0)}%)
              </Stat>
            )}
            {review.incomeReceived > 0 && <Stat label="Dividends and interest">{money(review.incomeReceived)}</Stat>}
            {review.milestonesReached.length > 0 && (
              <Stat label="Milestones crossed">{review.milestonesReached.map((m) => money(m)).join(", ")}</Stat>
            )}
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "1.5rem" }}>
            Based on your saved net worth history. Holdings facts reflect today and are shown only for the current year.
          </p>
        </>
      )}
    </div>
  );
}
