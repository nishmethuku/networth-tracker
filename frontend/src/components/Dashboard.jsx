import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import usePullToRefresh from "../hooks/usePullToRefresh";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { useAuth } from "../contexts/AuthContext";
import Card from "./Card";
import ErrorBoundary from "./ErrorBoundary";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import NetWorthChart from "./dashboard/NetWorthChart";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import AllocationDonut from "./dashboard/AllocationDonut";
import NetWorthBreakdown from "./dashboard/NetWorthBreakdown";
import GoalsCard from "./dashboard/GoalsCard";
import MoverHeatGrid from "./dashboard/MoverHeatGrid";
import ReturnsByTypeChart from "./dashboard/ReturnsByTypeChart";
import OnboardingWizard, { isOnboardingDismissed } from "./OnboardingWizard";
import AnimatedNumber from "./AnimatedNumber";
import { fetchDashboard, fetchNetWorthHistory, fetchHoldings, fetchBenchmark, ApiError } from "../api";
import { formatCurrencyCompact, formatPercent } from "../utils/formatters";

const CURRENCIES = ["USD", "INR", "AUD"];
const BENCHMARKS = [
  { value: "SPY", label: "S&P 500 (SPY)" },
  { value: "NIFTYBEES.NS", label: "Nifty 50 (NIFTYBEES)" },
];

function BenchmarkCard() {
  const [symbol, setSymbol] = useState("SPY");
  const { data: benchmark, isLoading } = useQuery({
    queryKey: ["benchmark", symbol],
    queryFn: () => fetchBenchmark(symbol, null),
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

export default function Dashboard() {
  const { user } = useAuth();
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
    queryKey: ["dashboard", currency],
    queryFn: () => fetchDashboard({ currency }),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const { data: history } = useQuery({
    queryKey: ["net-worth-history", currency],
    queryFn: () => fetchNetWorthHistory(null, currency),
    staleTime: 1000 * 60 * 5, // snapshots are written at most once/day
  });

  const { data: holdings } = useQuery({
    queryKey: ["holdings", "summary", currency],
    queryFn: () => fetchHoldings({ currency, summary: true }),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const { containerRef, pullDistance, refreshing, threshold } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["net-worth-history"] });
    await queryClient.invalidateQueries({ queryKey: ["holdings"] });
  });

  useEffect(() => {
    if (!isLoading && dashboard && user && (dashboard.allocationByType?.length ?? 0) === 0 && !isOnboardingDismissed(user.id)) {
      setShowOnboarding(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, dashboard, user]);

  if (isLoading) return <DashboardSkeleton />;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Net Worth
          </h1>
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
        <Link to="/import-spreadsheet" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>📄 Import Spreadsheet</Link>
        <Link to="/allocation-advisor" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>🎯 Allocation Advisor</Link>
        <Link to="/settings" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>⚙️ Settings</Link>
      </div>

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
            <Card
              title={t("dashboard.totalNetWorth")}
              value={<AnimatedNumber value={dashboard.totalNetWorth} format={(v) => formatCurrencyCompact(v, currency)} />}
            />
            <Card
              title={t("dashboard.unrealizedGains")}
              value={formatCurrencyCompact(dashboard.unrealizedGain, currency)}
              subtitle={t("dashboard.unrealizedGainsSubtitle")}
            />
            <Card
              title={t("dashboard.realizedGains")}
              value={formatCurrencyCompact(dashboard.realizedGain, currency)}
              subtitle={t("dashboard.realizedGainsSubtitle")}
            />
            {dashboard.portfolioXirr != null && (
              <Card
                title="Overall Portfolio XIRR"
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Net worth over time */}
            <Card title={t("dashboard.netWorthOverTime")}>
              <ErrorBoundary mode="section" fallbackMessage="The net worth chart couldn't load.">
                <NetWorthChart history={history} currency={currency} />
              </ErrorBoundary>
            </Card>

            {/* Allocation donut, drillable by type/country */}
            <Card title={t("dashboard.whereYourMoneyIs")}>
              <ErrorBoundary mode="section" fallbackMessage="The allocation chart couldn't load.">
                <AllocationDonut
                  allocationByType={dashboard.allocationByType}
                  allocationByCountry={dashboard.allocationByCountry}
                  holdings={holdings}
                  currency={currency}
                />
              </ErrorBoundary>
            </Card>

            <ErrorBoundary mode="section" fallbackMessage="Couldn't load goals.">
              <GoalsCard currentNetWorth={dashboard.totalNetWorth} displayCurrency={currency} />
            </ErrorBoundary>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <Card title="Net Worth Breakdown">
              <ErrorBoundary mode="section" fallbackMessage="Couldn't load the net worth breakdown.">
                <NetWorthBreakdown holdings={holdings} currency={currency} history={history} />
              </ErrorBoundary>
            </Card>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <ErrorBoundary mode="section" fallbackMessage="Couldn't load the benchmark comparison.">
              <BenchmarkCard />
            </ErrorBoundary>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <Card title={t("dashboard.returnsByType")} subtitle="Value-weighted average return per type">
              <ErrorBoundary mode="section" fallbackMessage="Couldn't compute returns by asset type.">
                <ReturnsByTypeChart holdings={holdings} />
              </ErrorBoundary>
            </Card>
          </div>

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
