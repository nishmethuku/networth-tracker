import { motion } from "framer-motion";
import { formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import { isQuantityBased } from "../constants/enums";

const SWIPE_THRESHOLD = -80;

/**
 * Mobile card view for a holding, replacing a table row below 640px.
 * Swipe left to reveal a delete action underneath (drag past the
 * threshold on release triggers the same confirm flow as the desktop
 * table's Delete button — nothing is destructive on swipe alone).
 */
export default function HoldingCard({ holding: h, onOpen, onDelete, currency }) {
  const quantityBased = isQuantityBased(h.assetType);
  const gain = quantityBased ? h.totalGain : h.gain;
  const positive = safeNumber(gain) >= 0;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius)" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          background: "var(--danger)",
          padding: "0 1.25rem",
        }}
      >
        <span style={{ color: "white", fontWeight: 600, fontSize: "0.875rem" }}>Delete</span>
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={{ left: 0.2, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < SWIPE_THRESHOLD) onDelete(h);
        }}
        onClick={onOpen}
        style={{
          position: "relative",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "0.875rem 1rem",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {h.symbol || h.name}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {h.country}{h.account ? ` • ${h.account}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text)" }}>
              {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
            </div>
            {gain != null && (
              <div style={{ fontSize: "0.75rem", color: positive ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                {positive ? "+" : ""}{formatCurrencyForDisplay(gain, h.currency, { includeCode: false })}
              </div>
            )}
          </div>
        </div>
        {quantityBased && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {h.quantity != null && <span>{h.quantity.toFixed(4)} units</span>}
            {h.xirr != null && (
              <span style={{ color: h.xirr >= 0 ? "var(--success)" : "var(--danger)" }}>{formatPercent(h.xirr * 100)} XIRR</span>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
