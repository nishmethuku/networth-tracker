import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import EmptyState from "../EmptyState";
import { formatPercent } from "../../utils/formatters";
import { computeReturnsByType } from "../../utils/holdingReturns";
import { capOutliersForChart } from "../../utils/chartScale";

export default function ReturnsByTypeChart({ holdings }) {
  const { data, domainCap } = useMemo(() => {
    const rows = computeReturnsByType(holdings || []);
    const { rows: capped, domainCap: cap } = capOutliersForChart(rows);
    return { data: capped.map(({ row, chartPct, clipped }) => ({ ...row, chartPct, clipped })), domainCap: cap };
  }, [holdings]);

  if (data.length === 0) {
    return <EmptyState message="Not enough data yet to compare returns by asset type." />;
  }

  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 42) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis
            type="number"
            domain={[-domainCap, domainCap]}
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
          />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: "var(--text)" }} width={110} />
          <ReferenceLine x={0} stroke="var(--border-dark)" />
          <Tooltip
            formatter={(_v, _name, props) => [formatPercent(props.payload.returnPct), "Return"]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Bar dataKey="chartPct" radius={[0, 4, 4, 0]} isAnimationActive={true}>
            {data.map((entry) => (
              <Cell key={entry.assetType} fill={entry.returnPct >= 0 ? "var(--success)" : "var(--danger)"} />
            ))}
            <LabelList
              dataKey="returnPct"
              content={({ x, y, width, height, value, index }) => {
                if (value == null) return null;
                const entry = data[index];
                const sign = value >= 0 ? "+" : "";
                const arrow = entry?.clipped ? (value >= 0 ? " ▶" : "◀ ") : "";
                const label = value >= 0 ? `${sign}${value.toFixed(1)}%${arrow}` : `${arrow}${sign}${value.toFixed(1)}%`;
                const lx = value >= 0 ? x + Math.max(0, width) + 4 : x + Math.min(0, width) - 4;
                return (
                  <text x={lx} y={y + (height || 0) / 2} dy={4} fontSize={11} fontWeight={600}
                    fill={entry?.clipped ? "var(--warning, #f59e0b)" : "var(--text)"}
                    textAnchor={value >= 0 ? "start" : "end"}>
                    {label}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
