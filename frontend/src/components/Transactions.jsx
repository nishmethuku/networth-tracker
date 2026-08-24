import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAllTransactions, ApiError } from "../api";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import VirtualTransactionList from "./VirtualTransactionList";
import TransactionCard from "./TransactionCard";
import useIsMobile from "../hooks/useIsMobile";
import { formatCurrencyForDisplay } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, COUNTRIES, getAssetTypeLabel } from "../constants/enums";

const VIRTUALIZE_THRESHOLD = 50;

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

export default function Transactions() {
  const [filters, setFilters] = useState({ assetType: "", country: "", dateFrom: "", dateTo: "" });
  const isMobile = useIsMobile();

  const {
    data: transactions,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchAllTransactions(filters),
    staleTime: 1000 * 30,
  });

  if (isLoading) return <LoadingState message="Loading transactions..." />;
  if (isError) {
    return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load transactions"} onRetry={refetch} />;
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "1.5rem" }}>Transactions</h1>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          padding: "1.25rem 1.5rem",
          background: "var(--card)",
          borderRadius: "var(--radius-md)",
          marginBottom: "1.5rem",
          border: "1px solid var(--border)",
        }}
      >
        <select value={filters.assetType} onChange={(e) => setFilters({ ...filters, assetType: e.target.value })} style={inputStyle}>
          <option value="">All Types</option>
          {ASSET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} style={inputStyle}>
          <option value="">All Countries</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          style={inputStyle}
          placeholder="From"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          style={inputStyle}
          placeholder="To"
        />
        {hasActiveFilters && (
          <button
            onClick={() => setFilters({ assetType: "", country: "", dateFrom: "", dateTo: "" })}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {!transactions || transactions.length === 0 ? (
        <EmptyState message="No transactions found." />
      ) : transactions.length > VIRTUALIZE_THRESHOLD ? (
        <Card>
          <VirtualTransactionList transactions={transactions} />
        </Card>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {transactions.map((t) => (
            <TransactionCard key={t.id} t={t} />
          ))}
        </div>
      ) : (
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Date</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Holding</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Type</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Quantity</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Price</th>
                  <th style={{ padding: "0.75rem 0.5rem" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{new Date(t.transactionDate).toLocaleDateString()}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <Link to={`/portfolio/${t.holdingId}`} style={{ fontWeight: 600 }}>
                        {t.holdingSymbol || t.holdingName}
                      </Link>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{getAssetTypeLabel(t.assetType)}</div>
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.5rem",
                        textTransform: "capitalize",
                        color: t.transactionType === "buy" ? "var(--success)" : "var(--danger)",
                        fontWeight: 600,
                      }}
                    >
                      {t.transactionType}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>{t.quantity.toFixed(4)}</td>
                    <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                      {formatCurrencyForDisplay(t.pricePerUnit, t.currency)}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {formatCurrencyForDisplay(t.quantity * t.pricePerUnit, t.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
