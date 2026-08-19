import { formatCurrencyForDisplay } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";

/**
 * A plain list of net value per asset type — the same allocationByType
 * data as the donut, just as readable numbers instead of a chart. Loans
 * (and any other type with a negative display_value, e.g. Credit paid
 * back below what was lent) show their real negative sign rather than
 * being hidden, unlike the donut which can't render negative slices.
 */
export default function HoldingsByTypeTable({ allocationByType, currency }) {
  const rows = [...(allocationByType || [])].sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.625rem 0",
            borderBottom: i < rows.length - 1 ? "1px solid var(--border-light)" : "none",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>{i + 1}.</span>
            {getAssetTypeLabel(row.label)}
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
  );
}
