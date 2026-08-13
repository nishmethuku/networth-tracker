import { useRef } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatCurrencyForDisplay } from "../utils/formatters";
import { getAssetTypeLabel } from "../constants/enums";

const ROW_HEIGHT = 56;
const COLUMNS = "1fr 1.6fr 0.9fr 1fr 1.2fr 1.2fr";

/**
 * Virtualized replacement for a plain <table> once the transaction log gets
 * long (see the threshold in Transactions.jsx) — only rows near the
 * viewport are ever mounted, so the list stays fast at any length instead
 * of degrading linearly with row count.
 */
export default function VirtualTransactionList({ transactions }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLUMNS,
          padding: "0.75rem 0.5rem",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        <div>Date</div>
        <div>Holding</div>
        <div>Type</div>
        <div>Quantity</div>
        <div>Price</div>
        <div>Total</div>
      </div>
      <div ref={parentRef} style={{ height: "min(70vh, 640px)", overflow: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const t = transactions[row.index];
            return (
              <div
                key={t.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                  display: "grid",
                  gridTemplateColumns: COLUMNS,
                  alignItems: "center",
                  padding: "0 0.5rem",
                  fontSize: "0.875rem",
                  borderBottom: "1px solid var(--border-light)",
                }}
              >
                <div>{new Date(t.transactionDate).toLocaleDateString()}</div>
                <div>
                  <Link to={`/portfolio/${t.holdingId}`} style={{ fontWeight: 600 }}>
                    {t.holdingSymbol || t.holdingName}
                  </Link>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{getAssetTypeLabel(t.assetType)}</div>
                </div>
                <div style={{ textTransform: "capitalize", color: t.transactionType === "buy" ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                  {t.transactionType}
                </div>
                <div style={{ fontFamily: "monospace" }}>{t.quantity.toFixed(4)}</div>
                <div style={{ fontFamily: "monospace" }}>{formatCurrencyForDisplay(t.pricePerUnit, t.currency)}</div>
                <div style={{ fontFamily: "monospace", fontWeight: 600 }}>
                  {formatCurrencyForDisplay(t.quantity * t.pricePerUnit, t.currency)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
