import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchDashboard, fetchAllocationAdvice, ApiError } from "../../api";
import { ASSET_TYPE_LABELS, getAssetTypeLabel } from "../../constants/enums";
import Card from "../Card";
import LoadingState from "../LoadingState";
import ErrorState from "../ErrorState";
import { formatCurrencyForDisplay } from "../../utils/formatters";

export default function AllocationAdvisor() {
  const [targets, setTargets] = useState({});
  const [result, setResult] = useState(null);

  const { data: dashboard, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-for-advisor"],
    queryFn: () => fetchDashboard({ currency: "USD" }),
  });

  const currentAllocation = dashboard?.allocationByType || [];
  const totalNetWorth = dashboard?.totalNetWorth || 0;

  const allTypes = useMemo(() => {
    const fromCurrent = currentAllocation.map((a) => a.label);
    const extra = Object.keys(targets).filter((t) => !fromCurrent.includes(t));
    return [...fromCurrent, ...extra];
  }, [currentAllocation, targets]);

  const targetTotal = Object.values(targets).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const advise = useMutation({
    mutationFn: () =>
      fetchAllocationAdvice({
        targetAllocation: Object.fromEntries(allTypes.map((t) => [t, Number(targets[t]) || 0])),
        currency: "USD",
      }),
    onSuccess: (data) => setResult(data),
  });

  function setSplitEvenly() {
    if (allTypes.length === 0) return;
    const even = Math.floor(100 / allTypes.length);
    const remainder = 100 - even * allTypes.length;
    const next = {};
    allTypes.forEach((t, i) => {
      next[t] = even + (i === 0 ? remainder : 0);
    });
    setTargets(next);
  }

  function useCurrentAsTarget() {
    const next = {};
    currentAllocation.forEach((a) => {
      next[a.label] = totalNetWorth > 0 ? Math.round((a.value / totalNetWorth) * 100) : 0;
    });
    setTargets(next);
  }

  if (isLoading) return <LoadingState message="Loading your portfolio..." />;
  if (isError) return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load portfolio"} onRetry={refetch} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Allocation Advisor</h1>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Set a target allocation by asset type and see exactly what to buy or sell to get there — informational only, not financial advice.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1.4fr)", gap: "1.5rem", alignItems: "start" }}>
        <Card title="Target allocation">
          {currentAllocation.length === 0 && Object.keys(targets).length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Add some holdings first to get allocation suggestions.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button onClick={useCurrentAsTarget} style={secondaryBtnStyle}>Start from current</button>
                <button onClick={setSplitEvenly} style={secondaryBtnStyle}>Split evenly</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {allTypes.map((type) => (
                  <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>{ASSET_TYPE_LABELS[type] || getAssetTypeLabel(type)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={targets[type] ?? ""}
                        onChange={(e) => setTargets((prev) => ({ ...prev, [type]: e.target.value }))}
                        style={{ width: "64px", padding: "0.4rem 0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", textAlign: "right" }}
                      />
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "1rem", fontSize: "0.8125rem", color: Math.abs(targetTotal - 100) < 0.5 ? "var(--success)" : "var(--warning)" }}>
                Total: {targetTotal.toFixed(0)}% {Math.abs(targetTotal - 100) < 0.5 ? "✓" : "(must equal 100%)"}
              </div>
              {advise.isError && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--danger)" }}>
                  {advise.error instanceof ApiError ? advise.error.message : "Something went wrong"}
                </div>
              )}
              <button
                onClick={() => advise.mutate()}
                disabled={advise.isPending || Math.abs(targetTotal - 100) >= 0.5 || allTypes.length === 0}
                style={{
                  marginTop: "1rem",
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius)",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--text-inverse)",
                  fontWeight: 600,
                  cursor: advise.isPending || Math.abs(targetTotal - 100) >= 0.5 ? "default" : "pointer",
                  opacity: advise.isPending || Math.abs(targetTotal - 100) >= 0.5 || allTypes.length === 0 ? 0.6 : 1,
                }}
              >
                {advise.isPending ? "Computing..." : "Get rebalance plan"}
              </button>
            </>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {!result ? (
            <Card>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Set your target allocation and click "Get rebalance plan" to see what to buy or sell.
              </p>
            </Card>
          ) : (
            <>
              {result.narrative && (
                <Card title="What this means">
                  <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{result.narrative}</p>
                </Card>
              )}
              {!result.ai_configured && (
                <Card>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                    AI narrative isn't configured yet — showing the computed rebalance math only.
                  </p>
                </Card>
              )}
              <Card title="Rebalance plan">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {result.rebalance_plan.map((p) => (
                    <div key={p.asset_type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: "1px solid var(--border-light)" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>
                          {ASSET_TYPE_LABELS[p.asset_type] || getAssetTypeLabel(p.asset_type)}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {p.current_pct.toFixed(1)}% → {p.target_pct.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          color: p.action === "buy" ? "var(--success)" : p.action === "sell" ? "var(--danger)" : "var(--text-muted)",
                          textTransform: "uppercase",
                        }}>
                          {p.action}
                        </span>
                        {p.action !== "hold" && (
                          <div style={{ fontSize: "0.875rem", color: "var(--text)" }}>{formatCurrencyForDisplay(p.amount, "USD")}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{result.disclaimer}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryBtnStyle = {
  padding: "0.4rem 0.75rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text)",
  fontSize: "0.75rem",
  cursor: "pointer",
};
