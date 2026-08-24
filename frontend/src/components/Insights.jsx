import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import ErrorBoundary from "./ErrorBoundary";
import MonthlySnapshots from "./dashboard/MonthlySnapshots";
import MonthlyNetFlow from "./dashboard/MonthlyNetFlow";
import { fetchNetWorthHistory, ApiError } from "../api";
import { CURRENCIES } from "../constants/enums";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";

const inputStyle = {
  padding: "0.5rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

export default function Insights() {
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);

  const { data: history, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["net-worth-history", currency],
    queryFn: () => fetchNetWorthHistory(null, currency),
  });

  if (isLoading) return <LoadingState message="Loading insights..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load insights"} onRetry={refetch} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Insights</h1>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        A closer look at how your net worth has moved over time.
      </p>

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Monthly Snapshots" subtitle="Net worth on the 1st of each month, with the split by type">
          <ErrorBoundary mode="section" fallbackMessage="Couldn't load monthly snapshots.">
            <MonthlySnapshots history={history} currency={currency} />
          </ErrorBoundary>
        </Card>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <Card title="Monthly Net Flow" subtitle="Money in and out of each holding type, per month">
          <ErrorBoundary mode="section" fallbackMessage="Couldn't load monthly net flow.">
            <MonthlyNetFlow currency={currency} />
          </ErrorBoundary>
        </Card>
      </div>
    </div>
  );
}
