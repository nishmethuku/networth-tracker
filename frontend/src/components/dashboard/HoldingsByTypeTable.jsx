import { useMemo, useState } from "react";
import { formatCurrencyForDisplay } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";

/**
 * A plain list of net value per asset type — the same allocationByType
 * data as the donut, just as readable numbers instead of a chart. Loans
 * (and any other type with a negative display_value, e.g. Credit paid
 * back below what was lent) show their real negative sign rather than
 * being hidden, unlike the donut which can't render negative slices.
 *
 * Clicking a type drills into its individual holdings, same interaction
 * as the donut — but unlike the donut, negative-valued holdings stay
 * visible here too (a pie slice can't be negative; a row can).
 */
export default function HoldingsByTypeTable({ allocationByType, holdings, currency }) {
  const [drill, setDrill] = useState(null); // asset type key, or null

  const topLevelRows = useMemo(
    () => [...(allocationByType || [])].sort((a, b) => b.value - a.value),
    [allocationByType]
  );

  const drillRows = useMemo(() => {
    if (!drill || !holdings) return null;
    return holdings
      .filter((h) => h.assetType === drill)
      .map((h) => ({ label: h.symbol || h.name, value: h.displayValue }))
      .sort((a, b) => b.value - a.value);
  }, [drill, holdings]);

  const rows = drillRows || topLevelRows;

  return (
    <div>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
        {drill ? (
          <span>
            <button onClick={() => setDrill(null)} style={breadcrumbBtnStyle}>All types</button>
            {" › "}
            <span style={{ color: "var(--text)" }}>{getAssetTypeLabel(drill)}</span>
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            onClick={() => !drillRows && setDrill(row.label)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.625rem 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border-light)" : "none",
              cursor: drillRows ? "default" : "pointer",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>
              <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>{i + 1}.</span>
              {drillRows ? row.label : getAssetTypeLabel(row.label)}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: row.value < 0 ? "var(--danger)" : "var(--text)",
              }}
            >
              {formatCurrencyForDisplay(row.value, currency, { includeCode: false })}
            </span>
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
