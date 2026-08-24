import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrencyCompact } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";

// A coordinated jewel-tone set (wine/gold/teal/etc.) that reads as
// deliberately designed rather than a default rainbow of primaries.
const COLORS = ["#7D2E42", "#B4872E", "#3F7D6B", "#5B6E9C", "#A6564B", "#6B7D3F", "#8A5A9C", "#4A8FA8", "#C77B4A", "#7D4A6E"];

const RADIAN = Math.PI / 180;
function renderPercentLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null; // skip slivers too thin to hold readable text
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

const VIEW_DATA_KEYS = { type: "assetType", country: "country", currency: "currency" };

export default function AllocationDonut({ allocationByType, allocationByCountry, allocationByCurrency, holdings, currency }) {
  const [view, setView] = useState("type"); // "type" | "country" | "currency"
  const [drill, setDrill] = useState(null); // { level: "type"|"country"|"currency", key: string } | null

  const VIEWS = { type: allocationByType, country: allocationByCountry, currency: allocationByCurrency };
  const topLevelData = VIEWS[view] || [];

  const drillData = useMemo(() => {
    if (!drill || !holdings) return null;
    const field = VIEW_DATA_KEYS[drill.level];
    const matching = holdings.filter((h) => h[field] === drill.key);
    return matching
      .map((h) => ({ label: h.symbol || h.name, value: h.displayValue }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [drill, holdings]);

  const data = drillData || topLevelData;
  const labelFor = (label) => (drillData ? label : view === "type" ? getAssetTypeLabel(label) : label);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  function handleSliceClick(entry) {
    if (drillData) return; // already drilled in, slices are individual holdings
    setDrill({ level: view, key: entry.label });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          {drill ? (
            <span>
              <button onClick={() => setDrill(null)} style={breadcrumbBtnStyle}>
                All
              </button>
              {" › "}
              <span style={{ color: "var(--text)" }}>{drill.level === "type" ? getAssetTypeLabel(drill.key) : drill.key}</span>
            </span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        <div
          style={{
            display: "inline-flex",
            gap: "0.2rem",
            background: "var(--bg-secondary)",
            borderRadius: "999px",
            padding: "0.2rem",
            border: "1px solid var(--border)",
          }}
        >
          {["type", "country", "currency"].map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setDrill(null);
              }}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.25rem 0.625rem",
                fontSize: "0.75rem",
                cursor: "pointer",
                background: view === v ? "var(--primary)" : "transparent",
                color: view === v ? "var(--text-inverse)" : "var(--text-secondary)",
                fontWeight: view === v ? 600 : 500,
              }}
            >
              {v === "type" ? "Type" : v === "country" ? "Country" : "Currency"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={3}
              label={renderPercentLabel}
              labelLine={false}
              onClick={handleSliceClick}
              isAnimationActive={true}
              cursor={drillData ? "default" : "pointer"}
            >
              {data.map((entry, index) => (
                <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, name) => [formatCurrencyCompact(v, currency), labelFor(name)]}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", marginTop: "0.25rem" }}>
        {data.map((entry, index) => (
          <div
            key={entry.label}
            onClick={() => handleSliceClick(entry)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.8125rem",
              cursor: drillData ? "default" : "pointer",
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[index % COLORS.length] }} />
            <span>{labelFor(entry.label)}</span>
            {/* The slice itself skips its label below 4% to avoid unreadable
                clutter, and there's no hover on mobile anyway — the legend
                is every category's one guaranteed place to show a percent. */}
            <span style={{ color: "var(--text-muted)" }}>{total > 0 ? Math.round((entry.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const breadcrumbBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--primary)",
  fontSize: "0.8125rem",
  cursor: "pointer",
  padding: 0,
  fontWeight: 500,
};
