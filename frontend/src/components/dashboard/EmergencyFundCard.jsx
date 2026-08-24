import { useQuery } from "@tanstack/react-query";
import Card from "../Card";
import { fetchEmergencyFund } from "../../api";
import { formatCurrencyCompact } from "../../utils/formatters";

export default function EmergencyFundCard({ currency }) {
  const { data, isLoading } = useQuery({
    queryKey: ["emergency-fund", currency],
    queryFn: () => fetchEmergencyFund({ currency }),
  });

  // No Budget expense history yet -> nothing meaningful to show; stays
  // hidden rather than displaying a confusing "0 months" for anyone who
  // hasn't used the Budget feature.
  if (isLoading || !data || data.avgMonthlyExpenses == null) return null;

  const pct = Math.min(100, (data.monthsCovered / data.recommendedMonths) * 100);
  const healthy = data.monthsCovered >= data.recommendedMonths;

  return (
    <Card title="Emergency Fund" subtitle={`Liquid cash vs. your average monthly spend — a ${data.recommendedMonths}-month cushion is the common rule of thumb`}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 700, color: healthy ? "var(--success)" : "var(--text)", fontFamily: "var(--font-mono)" }}>
          {data.monthsCovered.toFixed(1)}
        </span>
        <span style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
          month{data.monthsCovered === 1 ? "" : "s"} covered
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--bg-secondary)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: healthy ? "var(--success)" : "var(--primary)", borderRadius: 4, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        <span>Liquid cash: {formatCurrencyCompact(data.liquidValue, currency)}</span>
        <span>Avg spend/mo: {formatCurrencyCompact(data.avgMonthlyExpenses, currency)}</span>
      </div>
    </Card>
  );
}
