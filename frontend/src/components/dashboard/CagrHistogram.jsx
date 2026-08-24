import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import EmptyState from "../EmptyState";
import { formatPercent } from "../../utils/formatters";
import { holdingReturn } from "../../utils/holdingReturns";

/**
 * Per-holding CAGR (XIRR where meaningful, plain growth % otherwise — see
 * holdingReturn), plus a "Total" bar for the whole portfolio's own XIRR —
 * not a decomposition of the total (XIRR isn't additive across holdings),
 * just the same figure shown elsewhere on the Dashboard, placed alongside
 * the per-holding bars for a single at-a-glance comparison.
 */
export default function CagrHistogram({ holdings, portfolioXirr }) {
  const data = useMemo(() => {
    const rows = (holdings || [])
      .map((h) => {
        const { pct, isXirr } = holdingReturn(h);
        if (pct == null) return null;
        return { key: h.id, label: h.symbol || h.name, returnPct: pct, isXirr };
      })
      .filter(Boolean)
      .sort((a, b) => b.returnPct - a.returnPct);

    if (portfolioXirr != null) {
      rows.push({ key: "total", label: "Total", returnPct: portfolioXirr * 100, isXirr: true, isTotal: true });
    }
    return rows;
  }, [holdings, portfolioXirr]);

  if (data.length === 0) {
    return <EmptyState message="Not enough transaction history yet to compute CAGR." />;
  }

  return (
    <div style={{ width: "100%", height: Math.max(160, data.length * 34) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <YAxis
            type="category"
            dataKey="label"
            tick={({ x, y, payload }) => {
              const row = data.find((d) => d.label === payload.value);
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fontWeight={row?.isTotal ? 700 : 400} fill="var(--text)">
                  {payload.value}
                </text>
              );
            }}
            width={90}
          />
          <ReferenceLine x={0} stroke="var(--border-dark)" />
          <Tooltip
            formatter={(v, _name, props) => [formatPercent(v), props.payload.isXirr ? "XIRR" : "Growth"]}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <Bar dataKey="returnPct" radius={[0, 4, 4, 0]} isAnimationActive={true}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.isTotal ? "var(--primary)" : entry.returnPct >= 0 ? "var(--success)" : "var(--danger)"} />
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
