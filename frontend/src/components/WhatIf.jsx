import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import Card from "./Card";
import { useHousehold } from "../contexts/HouseholdContext";
import { fetchDashboard } from "../api";
import { formatCurrencyForDisplay, formatCurrencyCompact, formatPercent } from "../utils/formatters";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import useIsMobile from "../hooks/useIsMobile";
import { projectNetWorth, fireNumber, yearsToTarget, toTodaysDollars, scenarioRates } from "../utils/whatIfProjection";

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

const SERIES_LABELS = {
  value: "Expected",
  high: "Optimistic",
  low: "Cautious",
  contributed: "Total contributed",
};

export default function WhatIf() {
  const currency = getDefaultDisplayCurrency();
  const isMobile = useIsMobile();
  const { currentHouseholdId } = useHousehold();
  // Same query key Dashboard.jsx uses (currency + household both
  // included) -- shares its cache entry instead of a separate
  // "-for-whatif" one that never varied by currency or household, so
  // switching either here previously kept showing the first household/
  // currency's figures: a member viewing a shared household's What-If
  // page got seeded with their own personal net worth and XIRR instead
  // of the household's.
  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", currency, currentHouseholdId],
    queryFn: () => fetchDashboard({ currency, householdId: currentHouseholdId }),
  });

  // The default growth rate is a long-run market-average-ish figure, NOT
  // the portfolio's own XIRR. A short track record (here, about a year)
  // can show 18% or more, and compounding that for 20 years projects
  // millions -- a misleading headline for a scratch calculator. The
  // portfolio's own return is still shown below the field, with a one-click
  // way to use it if the person wants that scenario.
  const DEFAULT_RATE_PCT = 7;
  const MAX_RATE_PCT = 50;
  const SCENARIO_SPREAD_PTS = 3;
  const DEFAULT_INFLATION_PCT = 2.5;
  const ownRatePct =
    dashboard?.portfolioXirr != null && dashboard.portfolioXirr * 100 <= MAX_RATE_PCT
      ? Math.max(0, Math.round(dashboard.portfolioXirr * 1000) / 10)
      : null;

  const [startingAmount, setStartingAmount] = useState(null);
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [annualRatePct, setAnnualRatePct] = useState(null);
  const [years, setYears] = useState(20);
  const [showFire, setShowFire] = useState(false);
  const [realTerms, setRealTerms] = useState(false);
  const [inflationPct, setInflationPct] = useState(DEFAULT_INFLATION_PCT);
  const [annualExpenses, setAnnualExpenses] = useState(40000);
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(4);

  // Defaults to the real current net worth once the dashboard loads, but
  // only until the user actually edits the field — never silently
  // overwrites something they've already typed.
  const effectiveStarting = startingAmount ?? dashboard?.totalNetWorth ?? 0;
  // Stays null until the person actually edits the field, so it never
  // overwrites something they typed.
  const effectiveRate = annualRatePct ?? DEFAULT_RATE_PCT;
  // Also clamps a rate the user types in directly (not just the
  // suggestion above) -- someone can still explore an aggressive
  // scenario up to MAX_RATE_PCT, just not one that compounds into
  // physically meaningless numbers over a multi-decade projection.
  const clampedRate = Math.max(-50, Math.min(MAX_RATE_PCT, Number(effectiveRate) || 0));
  const clampedYears = Math.max(1, Math.min(60, Number(years) || 1));

  const { allSeries, points, lowPoints, highPoints } = useMemo(() => {
    const rates = scenarioRates(clampedRate, SCENARIO_SPREAD_PTS);
    const run = (annualRatePct) => {
      const raw = projectNetWorth({
        startingAmount: effectiveStarting,
        monthlyContribution: Number(monthlyContribution) || 0,
        annualRatePct,
        years: clampedYears,
      });
      return realTerms ? toTodaysDollars(raw, Number(inflationPct) || 0) : raw;
    };
    const base = run(rates.base);
    const low = run(rates.low);
    const high = run(rates.high);
    return {
      points: base,
      lowPoints: low,
      highPoints: high,
      allSeries: base.map((p, i) => ({ ...p, low: low[i].value, high: high[i].value })),
    };
  }, [effectiveStarting, monthlyContribution, clampedRate, clampedYears, realTerms, inflationPct]);

  const final = points[points.length - 1];

  const fireTarget = showFire ? fireNumber(Number(annualExpenses) || 0, Number(withdrawalRatePct) || 0) : null;
  const fireYear = fireTarget != null ? yearsToTarget(points, fireTarget) : null;

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>What-If</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Project where a starting amount plus a monthly contribution could get to, at a given growth rate — a scratch calculator, not a
        forecast.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(240px, 1fr) minmax(320px, 2fr)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <Card title="Assumptions">
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label htmlFor="whatif-starting-amount" style={labelStyle}>
                  Starting amount
                </label>
                <input
                  id="whatif-starting-amount"
                  type="number"
                  step="any"
                  min="0"
                  style={inputStyle}
                  value={effectiveStarting}
                  onChange={(e) => setStartingAmount(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                />
                {dashboard && (
                  <button
                    type="button"
                    onClick={() => setStartingAmount(dashboard.totalNetWorth)}
                    style={{
                      marginTop: "0.35rem",
                      fontSize: "0.75rem",
                      color: "var(--primary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Use my current net worth ({formatCurrencyCompact(dashboard.totalNetWorth, currency)})
                  </button>
                )}
              </div>
              <div>
                <label htmlFor="whatif-monthly-contribution" style={labelStyle}>
                  Monthly contribution
                </label>
                <input
                  id="whatif-monthly-contribution"
                  type="number"
                  step="any"
                  min="0"
                  style={inputStyle}
                  value={monthlyContribution}
                  onChange={(e) => setMonthlyContribution(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="whatif-annual-rate" style={labelStyle}>
                  Annual growth rate (%)
                </label>
                <input
                  id="whatif-annual-rate"
                  type="number"
                  step="any"
                  min={-50}
                  max={MAX_RATE_PCT}
                  style={inputStyle}
                  value={effectiveRate}
                  onChange={(e) => setAnnualRatePct(e.target.value)}
                />
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Default is a long-run market-style {DEFAULT_RATE_PCT}%.
                  {dashboard?.portfolioXirr != null && (
                    <>
                      {" "}
                      Your portfolio's own annualized return is {formatPercent(dashboard.portfolioXirr * 100)}, measured over a short
                      history
                      {ownRatePct == null && " (too far from a sustainable long-run rate to use here)"}.
                    </>
                  )}
                  {ownRatePct != null && Number(effectiveRate) !== ownRatePct && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={() => setAnnualRatePct(ownRatePct)}
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--primary)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Use {ownRatePct}% instead
                      </button>
                    </>
                  )}
                </div>
                {Number(effectiveRate) !== clampedRate && (
                  <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Projection uses {clampedRate}% — rates beyond ±{MAX_RATE_PCT}% aren't realistic to compound over multiple decades.
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="whatif-years" style={labelStyle}>
                  Years
                </label>
                <input
                  id="whatif-years"
                  type="number"
                  step="1"
                  min="1"
                  max="60"
                  style={inputStyle}
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginBottom: 0 }}>
                  <input type="checkbox" checked={realTerms} onChange={(e) => setRealTerms(e.target.checked)} />
                  Show in today's dollars (adjust for inflation)
                </label>
                {realTerms && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <label htmlFor="whatif-inflation" style={labelStyle}>
                      Expected inflation (% per year)
                    </label>
                    <input
                      id="whatif-inflation"
                      type="number"
                      step="any"
                      min="0"
                      max="50"
                      style={inputStyle}
                      value={inflationPct}
                      onChange={(e) => setInflationPct(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="FIRE calculator">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
                color: "var(--text)",
                cursor: "pointer",
                marginBottom: showFire ? "1rem" : 0,
              }}
            >
              <input type="checkbox" checked={showFire} onChange={(e) => setShowFire(e.target.checked)} />
              Show when I'd reach financial independence
            </label>
            {showFire && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label htmlFor="whatif-annual-expenses" style={labelStyle}>
                    Annual expenses in retirement
                  </label>
                  <input
                    id="whatif-annual-expenses"
                    type="number"
                    step="any"
                    min="0"
                    style={inputStyle}
                    value={annualExpenses}
                    onChange={(e) => setAnnualExpenses(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="whatif-withdrawal-rate" style={labelStyle}>
                    Safe withdrawal rate (%)
                  </label>
                  <input
                    id="whatif-withdrawal-rate"
                    type="number"
                    step="any"
                    min="0.1"
                    style={inputStyle}
                    value={withdrawalRatePct}
                    onChange={(e) => setWithdrawalRatePct(e.target.value)}
                  />
                  <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    The classic "4% rule" implies a 25x expenses target.
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1.25rem" }}>
            <Card
              title={`Projected in ${clampedYears} yr${clampedYears === 1 ? "" : "s"}${realTerms ? " (today's $)" : ""}`}
              value={formatCurrencyCompact(final.value, currency)}
              subtitle={`Range ${formatCurrencyCompact(lowPoints[lowPoints.length - 1].value, currency)} to ${formatCurrencyCompact(highPoints[highPoints.length - 1].value, currency)} at ±${SCENARIO_SPREAD_PTS} pts`}
            />
            <Card title="Total contributed" value={formatCurrencyCompact(final.contributed, currency)} />
            <Card
              title="Growth from returns"
              value={formatCurrencyCompact(final.growth, currency)}
              subtitle={final.contributed > 0 ? `${((final.growth / final.contributed) * 100).toFixed(0)}% of contributions` : undefined}
            />
            {showFire && fireTarget != null && (
              <Card
                title="FIRE number"
                value={formatCurrencyCompact(fireTarget, currency)}
                subtitle={fireYear != null ? `Reached in year ${fireYear}` : `Not reached within ${clampedYears} years`}
              />
            )}
          </div>

          <Card title="Projected net worth over time">
            <div style={{ width: "100%", height: 300, marginTop: "0.5rem" }}>
              <ResponsiveContainer>
                <LineChart data={allSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(y) => `Yr ${y}`} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(v) => formatCurrencyCompact(v, currency)}
                    width={64}
                  />
                  <Tooltip
                    formatter={(v, name) => [formatCurrencyForDisplay(v, currency), SERIES_LABELS[name] || name]}
                    labelFormatter={(y) => `Year ${y}`}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
                  />
                  <Legend formatter={(v) => SERIES_LABELS[v] || v} wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="high" stroke="var(--success)" strokeWidth={1.25} strokeOpacity={0.7} dot={false} />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="low" stroke="var(--danger)" strokeWidth={1.25} strokeOpacity={0.7} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="contributed"
                    stroke="var(--text-muted)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
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
            Assumes a constant annual rate compounded monthly, with a cautious and an optimistic line a few points either side — real
            returns vary year to year. Informational only, not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
