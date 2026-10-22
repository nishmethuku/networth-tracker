import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import Card from "../Card";
import { fetchBudgetSummary } from "../../api";
import { isPrivacyOn } from "../../utils/privacy";
import { formatCurrencyCompact } from "../../utils/formatters";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });

/** Income against spending for each recent month, from Budget entries. Hidden with fewer than two months. */
export default function SpendingTrendCard({ currency, householdId }) {
  const { data: summary } = useQuery({
    queryKey: ["budget-summary-12", currency, householdId],
    queryFn: () => fetchBudgetSummary({ months: 12, currency, householdId }),
  });

  const rows = useMemo(
    () =>
      (summary?.months || []).map((m) => {
        const [y, mo] = m.month.split("-").map(Number);
        return { label: MONTH.format(new Date(y, mo - 1, 1)), Income: m.income, Spending: m.expenses };
      }),
    [summary],
  );
  if (rows.length < 2) return null;

  return (
    <Card title="Income and spending" subtitle="Month by month, from your Budget entries">
      <div style={{ width: "100%", height: 240, marginTop: "0.75rem" }}>
        <ResponsiveContainer>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              width={52}
              tickFormatter={(v) => (isPrivacyOn() ? "" : formatCurrencyCompact(v, currency).replace(` ${currency}`, ""))}
            />
            <Tooltip
              formatter={(v) => formatCurrencyCompact(v, currency)}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Bar dataKey="Income" fill="var(--success)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Spending" fill="var(--danger)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
