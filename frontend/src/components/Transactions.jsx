import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAllTransactions, fetchHoldings, deleteTransaction, ApiError } from "../api";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import VirtualTransactionList from "./VirtualTransactionList";
import TransactionCard from "./TransactionCard";
import AddTransactionForm from "./AddTransactionForm";
import EditTransactionModal from "./EditTransactionModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useToast } from "../contexts/ToastContext";
import useIsMobile from "../hooks/useIsMobile";
import { useHousehold } from "../contexts/HouseholdContext";
import { formatCurrencyForDisplay, formatDateISO } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, COUNTRIES, getAssetTypeLabel, isQuantityBased } from "../constants/enums";

const VIRTUALIZE_THRESHOLD = 50;

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};

const PER_PAGE = 50;

export default function Transactions() {
  const [filters, setFilters] = useState({ assetType: "", country: "", dateFrom: "", dateTo: "", search: "" });
  const [page, setPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [searchDraft, setSearchDraft] = useState("");
  const searchTimeout = useRef(null);
  const isMobile = useIsMobile();
  const { currentHouseholdId } = useHousehold();
  const queryClient = useQueryClient();
  const toast = useToast();

  const deleteMutation = useMutation({
    mutationFn: (tx) => deleteTransaction(tx.id),
    onSuccess: (_, tx) => {
      queryClient.invalidateQueries({ queryKey: ["holding", String(tx.holdingId)] });
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", String(tx.holdingId)] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted");
      setDeletingTx(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete that transaction");
      setDeletingTx(null);
    },
  });

  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["transactions", filters, currentHouseholdId, page],
    queryFn: () => fetchAllTransactions({ ...filters, householdId: currentHouseholdId, page, perPage: PER_PAGE }),
    staleTime: 1000 * 30,
  });
  const transactions = result?.items;
  const totalPages = result?.totalPages || 1;
  const total = result?.total || 0;

  // Buy/Sell/Dividend/Interest only makes sense against something you hold
  // units of -- real estate/cash/etc. are valued directly (see HoldingDetail's
  // "Add Valuation" instead), so the picker only offers quantity-based holdings.
  const { data: tradeableHoldings } = useQuery({
    queryKey: ["holdings", "summary", "USD", currentHouseholdId],
    queryFn: () => fetchHoldings({ summary: true, householdId: currentHouseholdId }),
    enabled: showAddForm,
    select: (holdings) => holdings.filter((h) => isQuantityBased(h.assetType)),
  });
  const selectedHolding = tradeableHoldings?.find((h) => String(h.id) === selectedHoldingId);

  if (isLoading) return <LoadingState message="Loading transactions..." />;
  if (isError) {
    return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load transactions"} onRetry={refetch} />;
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  function updateFilters(next) {
    setFilters(next);
    setPage(1);
  }

  function handleSearchChange(val) {
    setSearchDraft(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(
      () =>
        setFilters((f) => {
          setPage(1);
          return { ...f, search: val };
        }),
      350,
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", gap: "1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Transactions</h1>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
              whiteSpace: "nowrap",
            }}
          >
            + Add Transaction
          </button>
        )}
      </div>

      {showAddForm && (
        <div style={{ marginBottom: "1.5rem" }}>
          <Card>
            <div style={{ marginBottom: selectedHolding ? "1rem" : 0 }}>
              <label
                htmlFor="tx-holding-picker"
                style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}
              >
                Holding
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  id="tx-holding-picker"
                  value={selectedHoldingId}
                  onChange={(e) => setSelectedHoldingId(e.target.value)}
                  style={{ ...inputStyle, flex: 1, maxWidth: 360 }}
                >
                  <option value="">Select a holding…</option>
                  {(tradeableHoldings || []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.symbol || h.name}
                      {h.account ? ` — ${h.account}` : ""} ({h.currency})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedHoldingId("");
                  }}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
            {selectedHolding && (
              <AddTransactionForm
                holding={selectedHolding}
                onDone={() => {
                  setShowAddForm(false);
                  setSelectedHoldingId("");
                }}
              />
            )}
          </Card>
        </div>
      )}

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
        <input
          type="search"
          placeholder="Search by symbol or name…"
          value={searchDraft}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ ...inputStyle, minWidth: 200 }}
        />
        <select value={filters.assetType} onChange={(e) => updateFilters({ ...filters, assetType: e.target.value })} style={inputStyle}>
          <option value="">All Types</option>
          {ASSET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={filters.country} onChange={(e) => updateFilters({ ...filters, country: e.target.value })} style={inputStyle}>
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
          onChange={(e) => updateFilters({ ...filters, dateFrom: e.target.value })}
          style={inputStyle}
          placeholder="From"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilters({ ...filters, dateTo: e.target.value })}
          style={inputStyle}
          placeholder="To"
        />
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchDraft("");
              updateFilters({ assetType: "", country: "", dateFrom: "", dateTo: "", search: "" });
            }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* isMobile checked before the virtualize threshold: VirtualTransactionList
          renders a fixed 6-column desktop grid with no mobile layout at all, so a
          mobile user with a long history must still get TransactionCard's stacked
          layout, not the virtualized list, regardless of transaction count. */}
      {!transactions || transactions.length === 0 ? (
        <EmptyState message="No transactions found." />
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {transactions.map((t) => (
            <TransactionCard key={t.id} t={t} onEdit={() => setEditingTx(t)} onDelete={() => setDeletingTx(t)} />
          ))}
        </div>
      ) : transactions.length > VIRTUALIZE_THRESHOLD ? (
        <Card>
          <VirtualTransactionList transactions={transactions} onEdit={setEditingTx} onDelete={setDeletingTx} />
        </Card>
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
                  <th style={{ padding: "0.75rem 0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{formatDateISO(t.transactionDate)}</td>
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
                        color: t.transactionType === "sell" ? "var(--danger)" : "var(--success)",
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
                    <td style={{ padding: "0.75rem 0.5rem", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => setEditingTx(t)}
                        style={{
                          fontSize: "0.8125rem",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          padding: "0.35rem 0.75rem",
                          marginRight: "0.4rem",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingTx(t)}
                        style={{ fontSize: "0.8125rem", background: "var(--danger)", color: "white", padding: "0.35rem 0.75rem" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editingTx && <EditTransactionModal transaction={editingTx} onClose={() => setEditingTx(null)} />}
      <ConfirmDeleteModal
        isOpen={!!deletingTx}
        title="Delete Transaction?"
        assetName={deletingTx ? `this ${deletingTx.transactionType} of ${deletingTx.holdingSymbol || deletingTx.holdingName}` : ""}
        onConfirm={() => deleteMutation.mutate(deletingTx)}
        onCancel={() => setDeletingTx(null)}
      />

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.25rem" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ ...inputStyle, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ ...inputStyle, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
