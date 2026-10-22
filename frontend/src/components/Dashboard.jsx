import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import usePullToRefresh from "../hooks/usePullToRefresh";
import useIsMobile from "../hooks/useIsMobile";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { useAuth } from "../contexts/AuthContext";
import { useHousehold } from "../contexts/HouseholdContext";
import Card from "./Card";
import ErrorBoundary from "./ErrorBoundary";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import NetWorthChart from "./dashboard/NetWorthChart";
import RebuildHistory from "./dashboard/RebuildHistory";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import AllocationDonut from "./dashboard/AllocationDonut";
import NetWorthBreakdown from "./dashboard/NetWorthBreakdown";
import GoalsCard from "./dashboard/GoalsCard";
import EmergencyFundCard from "./dashboard/EmergencyFundCard";
import MoverHeatGrid from "./dashboard/MoverHeatGrid";
import ReturnsByTypeChart from "./dashboard/ReturnsByTypeChart";
import CagrHistogram from "./dashboard/CagrHistogram";
import StressTestCard from "./dashboard/StressTestCard";
import MoneyHealthCard from "./dashboard/MoneyHealthCard";
import ChangeOverTimeCard from "./dashboard/ChangeOverTimeCard";
import SavingsRateCard from "./dashboard/SavingsRateCard";
import ProjectionCard from "./dashboard/ProjectionCard";
import NeedsAttentionCard from "./dashboard/NeedsAttentionCard";
import WelcomeBackCard from "./dashboard/WelcomeBackCard";
import GettingStartedCard from "./dashboard/GettingStartedCard";
import WhatMovedCard from "./dashboard/WhatMovedCard";
import ComingUpCard from "./dashboard/ComingUpCard";
import PriceFreshnessNote from "./dashboard/PriceFreshnessNote";
import InfoTip from "./InfoTip";
import CustomizeDashboard from "./dashboard/CustomizeDashboard";
import { useHiddenSections } from "../hooks/useHiddenSections";
import OnboardingWizard, { isOnboardingDismissed } from "./OnboardingWizard";
import AnimatedNumber from "./AnimatedNumber";
import { fetchDashboard, fetchNetWorthHistory, fetchHoldings, fetchBenchmark, fetchGoals, ApiError } from "../api";
import { formatCurrencyCompact, formatPercent, todayISO } from "../utils/formatters";
import { netWorthChange } from "../utils/netWorthChange";
import { groupBuyValueAndGain } from "../utils/holdingReturns";

const CURRENCIES = ["USD", "INR", "AUD"];
const CONCENTRATION_THRESHOLD_PCT = 25;
const BENCHMARKS = [
  { value: "SPY", label: "S&P 500 (SPY)" },
  { value: "NIFTYBEES.NS", label: "Nifty 50 (NIFTYBEES)" },
];

function BenchmarkCard() {
  const { currentHouseholdId } = useHousehold();
  const [symbol, setSymbol] = useState("SPY");
  const {
    data: benchmark,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["benchmark", symbol, currentHouseholdId],
    queryFn: () => fetchBenchmark(symbol, currentHouseholdId),
    retry: false,
  });

  return (
    <Card title="You vs the Market">
      <div style={{ marginBottom: "1rem", marginTop: "0.5rem" }}>
        <select
          aria-label="Compare against"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: "0.875rem",
          }}
        >
          {BENCHMARKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading...</p>
      ) : isError ? (
        <EmptyState message="Benchmark data temporarily unavailable — try again later." />
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

export default function Dashboard() {
  const { user } = useAuth();
  const { currentHouseholdId } = useHousehold();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard", currency, currentHouseholdId],
    queryFn: () => fetchDashboard({ currency, householdId: currentHouseholdId }),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const { data: history } = useQuery({
    queryKey: ["net-worth-history", currency, currentHouseholdId],
    queryFn: () => fetchNetWorthHistory(currentHouseholdId, currency),
    staleTime: 1000 * 60 * 5, // snapshots are written at most once/day
  });

  const { data: holdings } = useQuery({
    queryKey: ["holdings", "summary", currency, currentHouseholdId],
    queryFn: () => fetchHoldings({ currency, summary: true, householdId: currentHouseholdId }),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const { hidden, show, toggle: toggleSectionHidden, reset: resetSections } = useHiddenSections();

  const { data: goalList } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals, staleTime: 1000 * 60 });

  const monthChange = useMemo(
    () => (dashboard ? netWorthChange(history, dashboard.totalNetWorth, 30, todayISO()) : null),
    [history, dashboard],
  );

  const buyValueSummary = useMemo(() => groupBuyValueAndGain(holdings || []), [holdings]);

  const concentratedHoldings = useMemo(() => {
    const totalValue = (holdings || []).reduce((sum, h) => sum + (h.displayValue || 0), 0);
    if (totalValue <= 0) return [];
    return (holdings || [])
      .map((h) => ({ ...h, pctOfTotal: (h.displayValue / totalValue) * 100 }))
      .filter((h) => h.pctOfTotal >= CONCENTRATION_THRESHOLD_PCT)
      .sort((a, b) => b.pctOfTotal - a.pctOfTotal);
  }, [holdings]);

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["net-worth-history"] });
    await queryClient.invalidateQueries({ queryKey: ["holdings"] });
  });

  useEffect(() => {
    if (!isLoading && dashboard && user && (dashboard.allocationByType?.length ?? 0) === 0 && !isOnboardingDismissed(user.id)) {
      setShowOnboarding(true);
    }
  }, [isLoading, dashboard, user]);

  if (isLoading) return <DashboardSkeleton />;
  if (isError) {
    return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load dashboard"} onRetry={refetch} />;
  }
  if (!dashboard) return <EmptyState message="No data yet" />;

  const hasHoldings = dashboard.allocationByType.length > 0;
  // Regression: this used to gate the *entire* dashboard -- including the
  // Total Net Worth and Total Liabilities cards -- behind having at least
  // one holding. allocation_by_type is asset-only, so a user who'd only
  // entered a liability (a mortgage, say) with no holdings yet saw "No
  // holdings yet" instead of their real (negative) net worth and debt
  // total, which were sitting right there in the response, unrendered.
  const hasAnyData = hasHoldings || dashboard.totalLiabilities > 0;

  return (
    <div ref={containerRef}>
      {(pullDistance > 0 || refreshing) && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: Math.max(pullDistance, refreshing ? threshold : 0),
            overflow: "hidden",
            transition: refreshing ? "height 0.15s ease" : "none",
            color: "var(--primary)",
            fontSize: "0.8125rem",
            fontWeight: 600,
          }}
        >
          {refreshing ? "Refreshing…" : pullDistance >= threshold ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Net Worth</h1>
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

      {!hasAnyData ? (
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
            <Card
              title={t("dashboard.totalNetWorth")}
              value={<AnimatedNumber value={dashboard.totalNetWorth} format={(v) => formatCurrencyCompact(v, currency)} />}
              subtitle={
                [
                  dashboard.totalLiabilities > 0
                    ? `Assets ${formatCurrencyCompact(dashboard.totalAssets, currency)} − Liabilities ${formatCurrencyCompact(dashboard.totalLiabilities, currency)}`
                    : null,
                  monthChange
                    ? `${monthChange.delta >= 0 ? "+" : "−"}${formatCurrencyCompact(Math.abs(monthChange.delta), currency)}${
                        monthChange.pct != null ? ` (${monthChange.pct >= 0 ? "+" : "−"}${Math.abs(monthChange.pct).toFixed(1)}%)` : ""
                      } in the last 30 days`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
            {dashboard.totalLiabilities > 0 && (
              <Card
                title="Total Liabilities"
                value={formatCurrencyCompact(dashboard.totalLiabilities, currency)}
                subtitle="Mortgages, loans, credit cards"
              />
            )}
            {buyValueSummary.buyValue != null && (
              <Card
                title="Total Buy Value"
                value={formatCurrencyCompact(buyValueSummary.buyValue, currency)}
                subtitle={
                  buyValueSummary.gainAmount != null
                    ? `${buyValueSummary.gainAmount >= 0 ? "+" : ""}${formatCurrencyCompact(buyValueSummary.gainAmount, currency)}${
                        // A $0 buy value (e.g. a gifted position with no cost basis)
                        // would otherwise divide by zero into "+Infinity%"/"NaN%".
                        buyValueSummary.buyValue > 0
                          ? ` (${buyValueSummary.gainAmount >= 0 ? "+" : ""}${((buyValueSummary.gainAmount / buyValueSummary.buyValue) * 100).toFixed(1)}%)`
                          : ""
                      } overall`
                    : "What you originally paid for what you still hold"
                }
              />
            )}
            <Card
              title={
                <>
                  {t("dashboard.unrealizedGains")}
                  <InfoTip term="unrealized" />
                </>
              }
              value={formatCurrencyCompact(dashboard.unrealizedGain, currency)}
              subtitle={t("dashboard.unrealizedGainsSubtitle")}
            />
            <Card
              title={
                <>
                  {t("dashboard.realizedGains")}
                  <InfoTip term="realized" />
                </>
              }
              value={formatCurrencyCompact(dashboard.realizedGain, currency)}
              subtitle={t("dashboard.realizedGainsSubtitle")}
            />
            {dashboard.portfolioXirr != null && (
              <Card
                title={
                  <>
                    Overall Portfolio XIRR
                    <InfoTip term="xirr" />
                  </>
                }
                value={formatPercent(dashboard.portfolioXirr * 100)}
                subtitle="Annualized, across every buy/sell"
              />
            )}
            {!!dashboard.incomeReceived && (
              <Card
                title="Dividends & Interest"
                value={formatCurrencyCompact(dashboard.incomeReceived, currency)}
                subtitle="Income received, all time"
              />
            )}
          </div>

          {concentratedHoldings.length > 0 && (
            <div
              style={{
                background: "var(--warning-light, rgba(245,158,11,0.1))",
                border: "1px solid var(--warning, #f59e0b)",
                borderRadius: "var(--radius-md)",
                padding: "0.875rem 1.25rem",
                marginBottom: "1.5rem",
                fontSize: "0.875rem",
                color: "var(--text)",
              }}
            >
              <strong>Concentration warning</strong> —{" "}
              {concentratedHoldings.map((h, i) => (
                <span key={h.id}>
                  {h.symbol || h.name} ({h.pctOfTotal.toFixed(0)}%){i < concentratedHoldings.length - 1 ? ", " : ""}
                </span>
              ))}{" "}
              {concentratedHoldings.length === 1 ? "makes up" : "each make up"} more than {CONCENTRATION_THRESHOLD_PCT}% of your portfolio.{" "}
              <a href="/allocation-advisor" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "underline" }}>
                Review allocation →
              </a>
            </div>
          )}

          <PriceFreshnessNote />
          <CustomizeDashboard hidden={hidden} onToggle={toggleSectionHidden} onReset={resetSections} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Net worth over time */}
            {show("chart") && (
              <Card title={t("dashboard.netWorthOverTime")}>
                <ErrorBoundary mode="section" fallbackMessage="The net worth chart couldn't load.">
                  <NetWorthChart history={history} currency={currency} goals={goalList} />
                  {!currentHouseholdId && history && <RebuildHistory pointCount={history.length} />}
                </ErrorBoundary>
              </Card>
            )}

            {/* Allocation donut, drillable by type/country */}
            {show("allocation") && (
              <Card title={t("dashboard.whereYourMoneyIs")}>
                <ErrorBoundary mode="section" fallbackMessage="The allocation chart couldn't load.">
                  <AllocationDonut
                    allocationByType={dashboard.allocationByType}
                    allocationByCountry={dashboard.allocationByCountry}
                    allocationByCurrency={dashboard.allocationByCurrency}
                    holdings={holdings}
                    currency={currency}
                  />
                </ErrorBoundary>
              </Card>
            )}

            {show("goals") && (
              <ErrorBoundary mode="section" fallbackMessage="Couldn't load goals.">
                <GoalsCard currentNetWorth={dashboard.totalNetWorth} displayCurrency={currency} history={history} />
              </ErrorBoundary>
            )}

            {show("emergency") && (
              <ErrorBoundary mode="section" fallbackMessage="Couldn't load emergency fund status.">
                <EmergencyFundCard currency={currency} householdId={currentHouseholdId} />
              </ErrorBoundary>
            )}
          </div>

          {show("welcome") && <WelcomeBackCard current={dashboard.totalNetWorth} currency={currency} />}

          {show("started") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <GettingStartedCard
                holdingCount={(holdings || []).length}
                historyPoints={(history || []).length}
                currency={currency}
                householdId={currentHouseholdId}
              />
            </div>
          )}

          {show("attention") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <NeedsAttentionCard holdings={holdings} />
            </div>
          )}

          <div className="dash-grid">
            {show("upcoming") && (
              <div className="dash-cell">
                <ComingUpCard currency={currency} householdId={currentHouseholdId} />
              </div>
            )}

            {show("moved") && (
              <div className="dash-cell">
                <WhatMovedCard history={history} currency={currency} />
              </div>
            )}

            {show("change") && (
              <div className="dash-cell">
                <ChangeOverTimeCard history={history} current={dashboard.totalNetWorth} currency={currency} />
              </div>
            )}

            {show("savings") && (
              <div className="dash-cell">
                <SavingsRateCard currency={currency} householdId={currentHouseholdId} />
              </div>
            )}

            {show("projection") && (
              <div className="dash-cell">
                <ProjectionCard currentNetWorth={dashboard.totalNetWorth} currency={currency} householdId={currentHouseholdId} />
              </div>
            )}

            {show("health") && (
              <div className="dash-cell">
                <ErrorBoundary mode="section" fallbackMessage="Couldn't load the money health score.">
                  <MoneyHealthCard dashboard={dashboard} holdings={holdings} currency={currency} householdId={currentHouseholdId} />
                </ErrorBoundary>
              </div>
            )}
          </div>

          {show("stress") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <ErrorBoundary mode="section" fallbackMessage="Couldn't load the stress test.">
                <StressTestCard holdings={holdings} totalNetWorth={dashboard.totalNetWorth} currency={currency} />
              </ErrorBoundary>
            </div>
          )}

          {show("breakdown") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <Card title="Net Worth Breakdown">
                <ErrorBoundary mode="section" fallbackMessage="Couldn't load the net worth breakdown.">
                  <NetWorthBreakdown holdings={holdings} currency={currency} history={history} />
                </ErrorBoundary>
              </Card>
            </div>
          )}

          {show("benchmark") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <ErrorBoundary mode="section" fallbackMessage="Couldn't load the benchmark comparison.">
                <BenchmarkCard />
              </ErrorBoundary>
            </div>
          )}

          {show("returns") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <Card title={t("dashboard.returnsByType")} subtitle="Value-weighted average return per type">
                <ErrorBoundary mode="section" fallbackMessage="Couldn't compute returns by asset type.">
                  <ReturnsByTypeChart holdings={holdings} />
                </ErrorBoundary>
              </Card>
            </div>
          )}

          {show("cagr") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <Card
                title={
                  <>
                    CAGR by Holding
                    <InfoTip term="cagr" />
                  </>
                }
                subtitle="Annualized return (XIRR) per holding, plus your overall portfolio CAGR"
              >
                <ErrorBoundary mode="section" fallbackMessage="Couldn't compute CAGR by holding.">
                  <CagrHistogram holdings={holdings} portfolioXirr={dashboard.portfolioXirr} />
                </ErrorBoundary>
              </Card>
            </div>
          )}

          {/* Gainers / losers */}
          {show("movers") && (dashboard.topGainers.length > 0 || dashboard.topLosers.length > 0) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "1.5rem",
                marginTop: "1.5rem",
              }}
            >
              <Card title={t("dashboard.topGainers")}>
                {dashboard.topGainers.length === 0 ? (
                  <EmptyState message="Not enough price history yet." />
                ) : (
                  <ErrorBoundary mode="section" fallbackMessage="Couldn't load top gainers.">
                    <MoverHeatGrid movers={dashboard.topGainers} currency={currency} />
                  </ErrorBoundary>
                )}
              </Card>
              <Card title={t("dashboard.topLosers")}>
                {dashboard.topLosers.length === 0 ? (
                  <EmptyState message="Not enough price history yet." />
                ) : (
                  <ErrorBoundary mode="section" fallbackMessage="Couldn't load top losers.">
                    <MoverHeatGrid movers={dashboard.topLosers} currency={currency} />
                  </ErrorBoundary>
                )}
              </Card>
            </div>
          )}
        </>
      )}
      {showOnboarding && <OnboardingWizard onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}
