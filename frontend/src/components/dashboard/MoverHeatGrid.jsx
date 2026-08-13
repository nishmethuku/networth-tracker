import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { fetchHoldingPriceHistory } from "../../api";
import { formatCurrencyCompact, formatPercent } from "../../utils/formatters";

function heatColor(pct, isDark) {
  const magnitude = Math.min(Math.abs(pct), 20) / 20; // cap intensity scaling at ±20%
  const positive = pct >= 0;
  const hue = positive ? 142 : 0;
  const saturation = 55 + magnitude * 25;
  const lightness = isDark ? 16 + magnitude * 10 : 94 - magnitude * 24;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function Sparkline({ holdingId }) {
  const { data } = useQuery({
    queryKey: ["holding-price-history-sparkline", holdingId],
    queryFn: () => fetchHoldingPriceHistory(holdingId),
    staleTime: 1000 * 60 * 30,
  });

  if (!data || data.length < 2) return <div style={{ height: 32 }} />;

  return (
    <div style={{ width: "100%", height: 32 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line type="monotone" dataKey="price" stroke="currentColor" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MoverHeatGrid({ movers, currency }) {
  const [isDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.hasAttribute("data-theme") && window.matchMedia?.("(prefers-color-scheme: dark)").matches));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem" }}>
      {movers.map((m) => {
        const positive = m.changePct >= 0;
        return (
          <div
            key={m.id}
            style={{
              background: heatColor(m.changePct, isDark),
              borderRadius: "var(--radius)",
              padding: "0.75rem",
              border: "1px solid var(--border-light)",
              color: isDark ? "#f1f5f9" : "#0f172a",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.symbol || m.name}
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 700, marginTop: "0.15rem" }}>
              {positive ? "+" : ""}{formatPercent(m.changePct)}
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>{formatCurrencyCompact(m.currentValue, currency)}</div>
            <Sparkline holdingId={m.id} />
          </div>
        );
      })}
    </div>
  );
}
