import { Link } from "react-router-dom";
import { formatCurrencyForDisplay, formatDateISO } from "../utils/formatters";
import { getAssetTypeLabel, isIncomeTransactionType } from "../constants/enums";

export default function TransactionCard({ t, onEdit, onDelete }) {
  const isIncome = isIncomeTransactionType(t.transactionType);
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.875rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ minWidth: 0 }}>
          <Link to={`/portfolio/${t.holdingId}`} style={{ fontWeight: 600, color: "var(--text)" }}>
            {t.holdingSymbol || t.holdingName}
          </Link>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {getAssetTypeLabel(t.assetType)} • {formatDateISO(t.transactionDate)}
          </div>
        </div>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            color: t.transactionType === "sell" ? "var(--danger)" : "var(--success)",
          }}
        >
          {t.transactionType}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.5rem",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
        }}
      >
        {isIncome ? (
          <span>Income received</span>
        ) : (
          <span>
            {t.quantity.toFixed(4)} @ {formatCurrencyForDisplay(t.pricePerUnit, t.currency)}
          </span>
        )}
        <span style={{ fontWeight: 700, color: "var(--text)" }}>{formatCurrencyForDisplay(t.quantity * t.pricePerUnit, t.currency)}</span>
      </div>
      {(onEdit || onDelete) && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                flex: 1,
                fontSize: "0.8125rem",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "0.4rem 0",
              }}
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{ flex: 1, fontSize: "0.8125rem", background: "var(--danger)", color: "white", padding: "0.4rem 0" }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
