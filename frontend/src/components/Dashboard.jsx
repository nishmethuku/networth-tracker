import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDashboard, fetchNetWorthHistory, fetchHouseholds, fetchMilestones, acknowledgeMilestone, fetchBenchmark, ApiError } from "../api";
import { formatCurrencyCompact, formatPercent, safeNumber } from "../utils/formatters";
import { getAssetTypeLabel } from "../constants/enums";

const COLORS = ["#2563eb", "#16a34a", "#f97316", "#e11d48", "#22c55e", "#a855f7", "#eab308", "#06b6d4", "#8b5cf6", "#f43f5e"];
const CURRENCIES = ["USD", "INR", "AUD"];
const BENCHMARKS = [
  { value: "SPY", label: "S&P 500 (SPY)" },
  { value: "NIFTYBEES.NS", label: "Nifty 50 (NIFTYBEES)" },
];

function MilestoneBanner({ householdId }) {
  const queryClient = useQueryClient();
  const { data: milestones } = useQuery({
    queryKey: ["milestones", householdId],
    queryFn: () => fetchMilestones(householdId || null),
  });

  const ackMutation = useMutation({
    mutationFn: acknowledgeMilestone,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["milestones"] }),
  });

  const unacknowledged = (milestones || []).filter((m) => !m.acknowledged);
  if (unacknowledged.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
      {unacknowledged.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "1rem 1.5rem", borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--primary-light), var(--success-light))",
            border: "1px solid var(--primary)",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text)" }}>
            🎉 You crossed {m.threshold.toLocaleString()} {m.currency}!
          </span>
          <button
            onClick={() => ackMutation.mutate(m.id)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.875rem" }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

function BenchmarkCard({ householdId }) {
  const [symbol, setSymbol] = useState("SPY");
  const { data: benchmark, isLoading } = useQuery({
    queryKey: ["benchmark", symbol, householdId],
    queryFn: () => fetchBenchmark(symbol, householdId || null),
    retry: false,
  });

  return (
    <Card title="You vs the Market">
      <div style={{ marginBottom: "1rem", marginTop: "0.5rem" }}>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: "0.875rem" }}
        >
          {BENCHMARKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>
      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading...</p>
      ) : !benchmark || benchmark.portfolioXirr == null || benchmark.benchmarkXirr == null ? (
        <EmptyState message="Not enough buy history with available prices to compare yet." />
      ) : (
        <div style={{ display: "flex", gap: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Your Return</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: benchmark.portfolioXirr >= 0 ? "var(--success)" : "var(--danger)" }}>
              {formatPercent(benchmark.portfolioXirr * 100)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{benchmark.benchmarkLabel}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: benchmark.benchmarkXirr >= 0 ? "var(--success)" : "var(--danger)" }}>
              {formatPercent(benchmark.benchmarkXirr * 100)}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatYAxis(value, currency) {
  const num = Math.round(safeNumber(value));
  const abs = Math.abs(num);
  const symbol = currency === "INR" ? "₹" : "$";
  if (abs >= 1e6) return `${symbol}${Math.round(abs / 1e6)}M`;
  if (abs >= 1e3) return `${symbol}${Math.round(abs / 1e3)}K`;
  return `${symbol}${abs}`;
}

export default function Dashboard() {
  const [currency, setCurrency] = useState("USD");
  const [householdId, setHouseholdId] = useState("");

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds });

  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard", currency, householdId],
    queryFn: () => fetchDashboard({ currency, householdId: householdId || undefined }),
  });

  const { data: history } = useQuery({
    queryKey: ["net-worth-history", householdId],
    queryFn: () => fetchNetWorthHistory(householdId || null),
  });

  if (isLoading) return <LoadingState message="Loading your dashboard..." />;
  if (isError) {
    return (
      <ErrorState
        error={error instanceof ApiError ? error.message : "Failed to load dashboard"}
        onRetry={refetch}
      />
    );
  }
  if (!dashboard) return <EmptyState message="No data yet" />;

  const hasHoldings = dashboard.allocationByType.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Net Worth
          </h1>
          {households && households.length > 0 && (
            <select
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              style={{
                padding: "0.5rem 0.875rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "0.875rem",
              }}
            >
              <option value="">Just me</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          )}
        </div>
        <div
          style={{
            display: "inline-flex",
            gap: "0.25rem",
            background: "var(--card)",
            borderRadius: "999px",
            padding: "0.25rem",
            border: "1px solid var(--border)",
          }}
        >
          {CURRENCIES.map((cur) => (
            <button
              key={cur}
              onClick={() => setCurrency(cur)}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.4rem 0.9rem",
                fontSize: "0.8125rem",
                cursor: "pointer",
                background: currency === cur ? "var(--primary)" : "transparent",
                color: currency === cur ? "var(--text-inverse)" : "var(--text-secondary)",
                fontWeight: currency === cur ? 600 : 500,
              }}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <Link to="/alerts" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>🔔 Alerts</Link>
        <Link to="/tax-summary" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>🧾 Tax Summary</Link>
        <Link to="/import" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>📥 Import CSV</Link>
      </div>

      <MilestoneBanner householdId={householdId} />

      {!hasHoldings ? (
        <EmptyState message="No holdings yet. Add your first one from the Portfolio page." />
      ) : (
        <>
          {/* Top cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <Card title="Total Net Worth" value={formatCurrencyCompact(dashboard.totalNetWorth, currency)} />
            <Card
              title="Unrealized Gains"
              value={formatCurrencyCompact(dashboard.unrealizedGain, currency)}
              subtitle="On what you still hold"
            />
            <Card
              title="Realized Gains"
              value={formatCurrencyCompact(dashboard.realizedGain, currency)}
              subtitle="Locked in from sales"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Net worth over time */}
            <Card title="Net Worth Over Time">
              {!history || history.length === 0 ? (
                <EmptyState message="History builds up daily — check back tomorrow." />
              ) : (
                <div style={{ width: "100%", height: 300, marginTop: "1rem" }}>
                  <ResponsiveContainer>
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                        tickFormatter={(v) => formatYAxis(v, "USD")}
                      />
                      <Tooltip
                        formatter={(v) => formatCurrencyCompact(v, "USD")}
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                      />
                      <Line type="monotone" dataKey="netWorth" stroke="#2563eb" strokeWidth={3} name="Net Worth" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Allocation donut */}
            <Card title="Where Your Money Is">
              <div style={{ width: "100%", height: 300, marginTop: "1rem" }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={dashboard.allocationByType}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                    >
                      {dashboard.allocationByType.map((entry, index) => (
                        <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [formatCurrencyCompact(v, currency), getAssetTypeLabel(name)]}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", marginTop: "0.5rem" }}>
                {dashboard.allocationByType.map((entry, index) => (
                  <div key={entry.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
                    <span>{getAssetTypeLabel(entry.label)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <BenchmarkCard householdId={householdId} />
          </div>

          {/* Country breakdown */}
          <Card title="By Country" >
            <div style={{ width: "100%", height: 220, marginTop: "1rem" }}>
              <ResponsiveContainer>
                <BarChart data={dashboard.allocationByCountry} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(v) => formatYAxis(v, currency)} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: "var(--text)" }} width={100} />
                  <Tooltip
                    formatter={(v) => formatCurrencyCompact(v, currency)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                  />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Gainers / losers */}
          {(dashboard.topGainers.length > 0 || dashboard.topLosers.length > 0) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "1.5rem",
                marginTop: "1.5rem",
              }}
            >
              <Card title="Top Gainers (this month)">
                {dashboard.topGainers.length === 0 ? (
                  <EmptyState message="Not enough price history yet." />
                ) : (
                  <MoverList movers={dashboard.topGainers} currency={currency} />
                )}
              </Card>
              <Card title="Top Losers (this month)">
                {dashboard.topLosers.length === 0 ? (
                  <EmptyState message="Not enough price history yet." />
                ) : (
                  <MoverList movers={dashboard.topLosers} currency={currency} />
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MoverList({ movers, currency }) {
  return (
    <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {movers.map((m) => {
        const positive = m.changePct >= 0;
        return (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>{m.symbol || m.name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {formatCurrencyCompact(m.currentValue, currency)}
              </div>
            </div>
            <div style={{ color: positive ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
              {positive ? "+" : ""}{formatPercent(m.changePct)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
