import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchIncomeSummary, ApiError } from "../api";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatCurrencyCompact, formatPercent } from "../utils/formatters";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key) {
  const [, m] = key.split("-");
  return MONTH_NAMES[Number(m) - 1] || key;
}

const tableCell = { padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem" };

/**
 * Dividends and interest actually received: totals, a trailing-12-month
 * yield, a 12-month chart, and a per-holding breakdown. Income is recorded
 * as Dividend/Interest transactions (Transactions page), so this page only
 * reads what is already there.
 */
export default function Income() {
  const { currentHouseholdId } = useHousehold();
  const currency = getDefaultDisplayCurrency();

  const {
    data: income,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["income-summary", currency, currentHouseholdId],
    queryFn: () => fetchIncomeSummary(currency, currentHouseholdId),
    staleTime: 1000 * 60,
  });

  if (isLoading) return <LoadingState message="Adding up your income..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load income"} onRetry={refetch} />;

  const chartData = income.byMonth.map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Income</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Dividends and interest you have received. Record one from the{" "}
        <Link to="/transactions" style={{ color: "var(--primary)" }}>
          Transactions page
        </Link>{" "}
        by choosing Dividend or Interest.
      </p>

      {income.count === 0 ? (
        <EmptyState message="No dividends or interest recorded yet. Add one on the Transactions page and it will show up here." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            <Card title="Received, all time" value={formatCurrencyCompact(income.total, currency)} subtitle={`${income.count} payments`} />
            <Card
              title="Last 12 months"
              value={formatCurrencyCompact(income.last12Months, currency)}
              subtitle="Dividends and interest, after fees"
            />
            <Card
              title="Yield (last 12 months)"
              value={income.yieldPct != null ? formatPercent(income.yieldPct) : "n/a"}
              subtitle={
                income.yieldPct != null
                  ? "Income divided by today's value of what paid it"
                  : "Needs a holding that paid income and is still held"
              }
            />
          </div>

          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>Month by month</h2>
          <div style={{ width: "100%", height: 240, marginBottom: "2rem" }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => formatCurrencyCompact(v, currency).replace(` ${currency}`, "")}
                />
                <Tooltip
                  formatter={(v) => [formatCurrencyForDisplay(v, currency), "Income"]}
                  labelFormatter={(_l, p) => p?.[0]?.payload?.month}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                />
                <Bar dataKey="amount" fill="var(--success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>By year</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text)" }}>
                <tbody>
                  {income.byYear.map((y) => (
                    <tr key={y.year}>
                      <td style={tableCell}>{y.year}</td>
                      <td style={{ ...tableCell, textAlign: "right" }}>{formatCurrencyForDisplay(y.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>By holding</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--text)" }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textAlign: "left" }}>
                    <th style={tableCell}>Holding</th>
                    <th style={{ ...tableCell, textAlign: "right" }}>Last 12 mo</th>
                    <th style={{ ...tableCell, textAlign: "right" }}>All time</th>
                  </tr>
                </thead>
                <tbody>
                  {income.byHolding.map((h) => (
                    <tr key={h.holdingId}>
                      <td style={tableCell}>
                        <Link to={`/portfolio/${h.holdingId}`} style={{ color: "var(--primary)" }}>
                          {h.symbol || h.name}
                        </Link>
                      </td>
                      <td style={{ ...tableCell, textAlign: "right" }}>
                        {formatCurrencyForDisplay(h.last12Months, currency, { includeCode: false })}
                      </td>
                      <td style={{ ...tableCell, textAlign: "right" }}>
                        {formatCurrencyForDisplay(h.total, currency, { includeCode: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
