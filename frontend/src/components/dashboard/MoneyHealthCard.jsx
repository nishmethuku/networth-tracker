import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "../Card";
import { fetchEmergencyFund } from "../../api";
import { computeMoneyHealth } from "../../utils/moneyHealth";

function barColor(score) {
  if (score >= 80) return "var(--success)";
  if (score >= 40) return "var(--primary)";
  return "var(--danger)";
}

/** One 0 to 100 number with plain reasons and a single next step. */
export default function MoneyHealthCard({ dashboard, holdings, currency, householdId }) {
  // Same query key as the Emergency Fund card, so this costs no extra request.
  const { data: fund } = useQuery({
    queryKey: ["emergency-fund", currency, householdId],
    queryFn: () => fetchEmergencyFund({ currency, householdId }),
  });

  const result = useMemo(
    () =>
      computeMoneyHealth({
        emergencyMonths: fund && fund.avgMonthlyExpenses != null ? fund.monthsCovered : null,
        emergencyTarget: fund?.recommendedMonths ?? null,
        holdings: (holdings || []).map((h) => ({ label: h.symbol || h.name || "A holding", value: h.displayValue || 0 })),
        allocationByType: dashboard?.allocationByType || [],
        totalAssets: dashboard?.totalAssets || 0,
        totalLiabilities: dashboard?.totalLiabilities || 0,
      }),
    [fund, holdings, dashboard],
  );

  if (result.score == null) return null;

  return (
    <Card title="Money Health" subtitle="A quick check on four rules of thumb. A nudge, not financial advice.">
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "2.25rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: barColor(result.score) }}>
          {result.score}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>out of 100 · {result.label}</span>
      </div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {result.factors.map((f) => (
          <div key={f.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{f.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{Math.round(f.score)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${f.score}%`, background: barColor(f.score), borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{f.detail}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "1rem",
          padding: "0.625rem 0.75rem",
          borderRadius: "var(--radius)",
          background: "var(--primary-light)",
          fontSize: "0.875rem",
          color: "var(--text)",
        }}
      >
        <strong>Next step:</strong> {result.nextStep}
      </div>
    </Card>
  );
}
