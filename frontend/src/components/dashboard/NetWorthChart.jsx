import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import EmptyState from "../EmptyState";
import { formatCurrencyCompact, safeNumber } from "../../utils/formatters";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

function formatYAxis(value, currency) {
  const num = Math.round(safeNumber(value));
  const abs = Math.abs(num);
  const symbol = currency === "INR" ? "₹" : currency === "AUD" ? "A$" : "$";
  if (abs >= 1e6) return `${symbol}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${symbol}${Math.round(abs / 1e3)}K`;
  return `${symbol}${abs}`;
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const delta = point.delta;
  const deltaPct = point.deltaPct;
  const positive = delta >= 0;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.625rem 0.875rem", boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>{formatCurrencyCompact(point.netWorth, currency)}</div>
      {delta != null && (
        <div style={{ fontSize: "0.75rem", color: positive ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
          {positive ? "+" : ""}{formatCurrencyCompact(delta, currency)}
          {deltaPct != null && ` (${positive ? "+" : ""}${deltaPct.toFixed(1)}%)`}
          {" "}since start of range
        </div>
      )}
    </div>
  );
}

export default function NetWorthChart({ history, currency }) {
  const [rangeIdx, setRangeIdx] = useState(3); // default "All"

  const filtered = useMemo(() => {
    if (!history || history.length === 0) return [];
    const range = RANGES[rangeIdx];
    let rows = history;
    if (range.days != null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - range.days);
      rows = history.filter((h) => new Date(h.date) >= cutoff);
      if (rows.length === 0) rows = history.slice(-2); // fall back rather than showing nothing
    }
    const base = rows[0]?.netWorth ?? 0;
    return rows.map((r) => ({ ...r, delta: r.netWorth - base }));
  }, [history, rangeIdx]);

  if (!history || history.length === 0) {
    return <EmptyState message="History builds up daily — check back tomorrow." />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.25rem", marginBottom: "0.5rem" }}>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            style={{
              padding: "0.25rem 0.625rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: rangeIdx === i ? "var(--primary)" : "transparent",
              color: rangeIdx === i ? "var(--text-inverse)" : "var(--text-secondary)",
              fontSize: "0.75rem",
              fontWeight: rangeIdx === i ? 600 : 500,
              cursor: "pointer",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={filtered}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} minTickGap={30} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickFormatter={(v) => formatYAxis(v, currency)} width={56} />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#netWorthGradient)"
              isAnimationActive={true}
              dot={filtered.length < 60 ? { r: 2, fill: "var(--primary)" } : false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
