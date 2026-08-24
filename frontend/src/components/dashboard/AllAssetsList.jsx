import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatCurrencyForDisplay, formatPercent } from "../../utils/formatters";
import { getAssetTypeLabel } from "../../constants/enums";
import { holdingReturn } from "../../utils/holdingReturns";
import EmptyState from "../EmptyState";
import useIsMobile from "../../hooks/useIsMobile";

function ReturnCell({ pct, isXirr }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span style={{ color: pct >= 0 ? "var(--success)" : "var(--danger)" }}>
      {pct >= 0 ? "+" : ""}{formatPercent(pct)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{isXirr ? "XIRR" : "return"}</span>
    </span>
  );
}

/**
 * Every individual holding in one flat, value-sorted list — a quick way to
 * browse and jump straight to any specific asset's detail page, without
 * going through category -> account first like Net Worth Breakdown below
 * requires. Complements that drill-down rather than replacing it.
 */
export default function AllAssetsList({ holdings, currency }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const list = holdings || [];

  const sorted = useMemo(() => [...list].sort((a, b) => b.displayValue - a.displayValue), [list]);

  if (sorted.length === 0) return <EmptyState message="No holdings yet." />;

  const valueMinWidth = isMobile ? 76 : 100;
  const returnMinWidth = isMobile ? 88 : 120;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((h, i) => (
        <div
          key={h.id}
          onClick={() => navigate(`/portfolio/${h.id}`)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.625rem 0",
            cursor: "pointer",
            fontSize: "0.875rem",
            borderBottom: i < sorted.length - 1 ? "1px solid var(--border-light)" : "none",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.displayName}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {getAssetTypeLabel(h.assetType)}{h.account ? ` · ${h.account}` : ""}
            </div>
          </span>
          <span style={{ display: "flex", gap: isMobile ? "0.625rem" : "1.5rem", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: valueMinWidth, textAlign: "right" }}>
              {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
            </span>
            <span style={{ minWidth: returnMinWidth, textAlign: "right", fontFamily: "var(--font-mono)" }}>
              <ReturnCell {...holdingReturn(h)} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
