import { useMemo, useState } from "react";
import { formatCurrencyForDisplay } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";

// A coordinated jewel-tone set (wine/gold/teal/etc.) that reads as
// deliberately designed rather than a default rainbow of primaries.
const COLORS = ["#7D2E42", "#B4872E", "#3F7D6B", "#5B6E9C", "#A6564B", "#6B7D3F", "#8A5A9C", "#4A8FA8", "#C77B4A", "#7D4A6E"];

/** One slice per stock (or asset): several lots or accounts of the same symbol add up to a single slice. */
export function combineHoldingSlices(holdings) {
  const byLabel = new Map();
  for (const h of holdings) {
    const label = h.symbol || h.name;
    byLabel.set(label, (byLabel.get(label) || 0) + (h.displayValue || 0));
  }
  return [...byLabel.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
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
    return combineHoldingSlices(matching);
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

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Where your money is">
        {data.map((entry, index) => {
          const pct = total > 0 ? (entry.value / total) * 100 : 0;
          return (
            <li
              key={entry.label}
              style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border-light)", cursor: drillData ? "default" : "pointer" }}
              onClick={() => handleSliceClick(entry)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.875rem" }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{labelFor(entry.label)}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                  {formatCurrencyForDisplay(entry.value, currency, { includeCode: false })}{" "}
                  <span style={{ color: "var(--text-muted)" }}>· {pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--bg-secondary)", overflow: "hidden", marginTop: "0.35rem" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: COLORS[index % COLORS.length], borderRadius: 3 }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: 700, paddingTop: "0.6rem" }}>
        <span style={{ color: "var(--text)" }}>Total</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
          {formatCurrencyForDisplay(total, currency, { includeCode: false })}
        </span>
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
