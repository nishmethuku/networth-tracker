import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import EmptyState from "../EmptyState";
import { formatPercent } from "../../utils/formatters";
import { computeReturnsByType } from "../../utils/holdingReturns";

export default function ReturnsByTypeChart({ holdings }) {
  const data = useMemo(() => computeReturnsByType(holdings || []), [holdings]);

  if (data.length === 0) {
    return <EmptyState message="Not enough data yet to compare returns by asset type." />;
  }

  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 42) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: "var(--text)" }} width={110} />
          <ReferenceLine x={0} stroke="var(--border-dark)" />
          <Tooltip
            formatter={(v) => formatPercent(v)}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Bar dataKey="returnPct" radius={[0, 4, 4, 0]} isAnimationActive={true}>
            {data.map((entry) => (
              <Cell key={entry.assetType} fill={entry.returnPct >= 0 ? "var(--success)" : "var(--danger)"} />
            ))}
            <LabelList
              dataKey="returnPct"
              position="right"
              formatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--text)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
