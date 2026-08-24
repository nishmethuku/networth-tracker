import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import Card from "./Card";
import { fetchDashboard } from "../api";
import { formatCurrencyForDisplay, formatCurrencyCompact, formatPercent } from "../utils/formatters";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { projectNetWorth, fireNumber, yearsToTarget } from "../utils/whatIfProjection";

const inputStyle = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: "0.9375rem",
};
const labelStyle = { fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" };

export default function WhatIf() {
  const currency = getDefaultDisplayCurrency();
  const { data: dashboard } = useQuery({
    queryKey: ["dashboard-for-whatif"],
    queryFn: () => fetchDashboard({ currency }),
  });

  const suggestedRate = dashboard?.portfolioXirr != null ? Math.max(0, Math.round(dashboard.portfolioXirr * 1000) / 10) : 8;

  const [startingAmount, setStartingAmount] = useState(null);
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [annualRatePct, setAnnualRatePct] = useState(suggestedRate);
  const [years, setYears] = useState(20);
  const [showFire, setShowFire] = useState(false);
  const [annualExpenses, setAnnualExpenses] = useState(40000);
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(4);

  // Defaults to the real current net worth once the dashboard loads, but
  // only until the user actually edits the field — never silently
  // overwrites something they've already typed.
  const effectiveStarting = startingAmount ?? dashboard?.totalNetWorth ?? 0;

  const points = useMemo(
    () =>
      projectNetWorth({
        startingAmount: effectiveStarting,
        monthlyContribution: Number(monthlyContribution) || 0,
        annualRatePct: Number(annualRatePct) || 0,
        years: Math.max(1, Math.min(60, Number(years) || 1)),
      }),
    [effectiveStarting, monthlyContribution, annualRatePct, years]
  );

  const final = points[points.length - 1];

  const fireTarget = showFire ? fireNumber(Number(annualExpenses) || 0, Number(withdrawalRatePct) || 0) : null;
  const fireYear = fireTarget != null ? yearsToTarget(points, fireTarget) : null;

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>What-If</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Project where a starting amount plus a monthly contribution could get to, at a given growth rate — a scratch calculator, not a forecast.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(320px, 2fr)", gap: "1.5rem", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Card title="Assumptions">
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Starting amount</label>
              <input
                type="number" step="any" min="0" style={inputStyle}
                value={effectiveStarting}
                onChange={(e) => setStartingAmount(e.target.value === "" ? 0 : parseFloat(e.target.value))}
              />
              {dashboard && (
                <button
                  type="button"
                  onClick={() => setStartingAmount(dashboard.totalNetWorth)}
                  style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Use my current net worth ({formatCurrencyCompact(dashboard.totalNetWorth, currency)})
                </button>
              )}
            </div>
            <div>
              <label style={labelStyle}>Monthly contribution</label>
              <input type="number" step="any" min="0" style={inputStyle} value={monthlyContribution} onChange={(e) => setMonthlyContribution(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Annual growth rate (%)</label>
              <input type="number" step="any" style={inputStyle} value={annualRatePct} onChange={(e) => setAnnualRatePct(e.target.value)} />
              {dashboard?.portfolioXirr != null && (
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Your portfolio's own annualized return: {formatPercent(dashboard.portfolioXirr * 100)}
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Years</label>
              <input type="number" step="1" min="1" max="60" style={inputStyle} value={years} onChange={(e) => setYears(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card title="FIRE calculator">
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text)", cursor: "pointer", marginBottom: showFire ? "1rem" : 0 }}>
            <input type="checkbox" checked={showFire} onChange={(e) => setShowFire(e.target.checked)} />
            Show when I'd reach financial independence
          </label>
          {showFire && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Annual expenses in retirement</label>
                <input type="number" step="any" min="0" style={inputStyle} value={annualExpenses} onChange={(e) => setAnnualExpenses(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Safe withdrawal rate (%)</label>
                <input type="number" step="any" min="0.1" style={inputStyle} value={withdrawalRatePct} onChange={(e) => setWithdrawalRatePct(e.target.value)} />
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>The classic "4% rule" implies a 25x expenses target.</div>
              </div>
            </div>
          )}
        </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1.25rem" }}>
            <Card title={`Projected in ${years} yr${years == 1 ? "" : "s"}`} value={formatCurrencyCompact(final.value, currency)} />
            <Card title="Total contributed" value={formatCurrencyCompact(final.contributed, currency)} />
            <Card title="Growth from returns" value={formatCurrencyCompact(final.growth, currency)} subtitle={final.contributed > 0 ? `${((final.growth / final.contributed) * 100).toFixed(0)}% of contributions` : undefined} />
            {showFire && fireTarget != null && (
              <Card
                title="FIRE number"
                value={formatCurrencyCompact(fireTarget, currency)}
                subtitle={fireYear != null ? `Reached in year ${fireYear}` : `Not reached within ${years} years`}
              />
            )}
          </div>

          <Card title="Projected net worth over time">
            <div style={{ width: "100%", height: 300, marginTop: "0.5rem" }}>
              <ResponsiveContainer>
                <LineChart data={points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(y) => `Yr ${y}`} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(v) => formatCurrencyCompact(v, currency)} width={64} />
                  <Tooltip
                    formatter={(v, name) => [formatCurrencyForDisplay(v, currency), name === "value" ? "Projected value" : "Total contributed"]}
                    labelFormatter={(y) => `Year ${y}`}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                  />
                  <Legend formatter={(v) => (v === "value" ? "Projected value" : "Total contributed")} wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="contributed" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  {showFire && fireTarget != null && (
                    <ReferenceLine
                      y={fireTarget}
                      stroke="var(--success)"
                      strokeDasharray="5 3"
                      label={{ value: "FIRE number", position: "insideTopRight", fontSize: 10, fill: "var(--success)" }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Assumes a constant annual rate compounded monthly — real returns vary year to year. Informational only, not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
