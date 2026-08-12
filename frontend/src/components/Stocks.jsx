import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchStocks, deleteAsset, updateAsset, ApiError } from "../api";
import { formatCurrencyForCountry, safeNumber } from "../utils/formatters";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";

function ConfirmModal({ isOpen, onConfirm, onCancel, title, message }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--card)",
          padding: "2rem",
          borderRadius: "8px",
          maxWidth: "400px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: "1rem" }}>{title}</h3>
        <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={onConfirm}
            style={{ background: "var(--danger)", color: "white" }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Stocks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ units: "", buyPrice: "", purchaseDate: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const {
    data: stocks,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stocks"],
    queryFn: fetchStocks,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setDeleteConfirmId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAsset(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setEditingId(null);
      setEditForm({ units: "", buyPrice: "" });
    },
  });

  function startEdit(stock) {
    setEditingId(stock.id);
    setEditForm({
      units: stock.units.toString(),
      buyPrice: stock.buyPrice.toString(),
      // Prefer purchaseDate; fall back to createdAt date if needed
      purchaseDate: stock.purchaseDate
        ? stock.purchaseDate.slice(0, 10)
        : stock.createdAt
        ? new Date(stock.createdAt).toISOString().slice(0, 10)
        : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ units: "", buyPrice: "", purchaseDate: "" });
  }

  function handleSaveEdit(stockId) {
    const payload = {
      units: parseFloat(editForm.units),
      buy_price: parseFloat(editForm.buyPrice),
    };

    // Only send purchase_date if user provided a value
    if (editForm.purchaseDate) {
      payload.purchase_date = editForm.purchaseDate;
    }

    updateMutation.mutate({
      id: stockId,
      data: payload,
    });
  }

  function handleDelete(stockId) {
    deleteMutation.mutate(stockId);
  }

  if (isLoading) {
    return <LoadingState message="Loading stocks..." />;
  }

  if (isError) {
    return (
      <ErrorState
        error={error instanceof ApiError ? error.message : "Failed to fetch stocks"}
        onRetry={refetch}
        message="Could not fetch stocks. Please try again."
      />
    );
  }

  if (!stocks || stocks.length === 0) {
    return (
      <EmptyState
        message="No stocks yet. Add your first one!"
        action={
          <button
            onClick={() => navigate("/add-asset")}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "var(--text-inverse)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9375rem",
              transition: "all 0.2s ease",
              boxShadow: "var(--shadow)",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "var(--primary-hover)";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "var(--primary)";
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "var(--shadow)";
            }}
          >
            Add Stock
          </button>
        }
      />
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", marginBottom: "1.5rem", letterSpacing: "-0.02em" }}>Stocks / Investments</h2>

      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        onConfirm={() => handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        title="Delete Stock?"
        message="Are you sure you want to delete this stock? This action cannot be undone."
      />

      <div style={{ marginTop: "1.5rem", overflowX: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "var(--card)",
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
            >
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Ticker</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Shares</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Buy</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Current</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Value</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>P/L</th>
              <th style={{ padding: "0.875rem 0.75rem", fontWeight: 600, color: "var(--text)", fontSize: "0.875rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const editing = editingId === stock.id;
              const profitLoss = safeNumber(stock.profitLoss);
              const positive = profitLoss >= 0;

              return (
                <tr
                  key={stock.id}
                  style={{
                    borderBottom: "1px solid var(--border-light)",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  {/* Ticker + date added (editable) */}
                  <td style={{ padding: "0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>
                      {stock.symbol || stock.ticker || "—"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      {editing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span>Added:</span>
                          <input
                            type="date"
                            value={editForm.purchaseDate}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setEditForm({ ...editForm, purchaseDate: e.target.value })
                            }
                            style={{
                              padding: "0.2rem 0.35rem",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid var(--border)",
                              background: "var(--card)",
                              color: "var(--text)",
                              fontSize: "0.75rem",
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor = "var(--primary)";
                              e.target.style.boxShadow = "0 0 0 2px var(--primary-light)";
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor = "var(--border)";
                              e.target.style.boxShadow = "none";
                            }}
                          />
                        </div>
                      ) : (
                        <span>
                          Added{" "}
                          {stock.purchaseDate
                            ? new Date(stock.purchaseDate).toLocaleDateString()
                            : stock.createdAt
                            ? new Date(stock.createdAt).toLocaleString()
                            : "—"}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Shares */}
                  <td style={{ padding: "0.75rem" }}>
                    {editing ? (
                      <input
                        type="number"
                        value={editForm.units}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setEditForm({ ...editForm, units: e.target.value })
                        }
                        style={{
                          width: "80px",
                          padding: "0.375rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                          color: "var(--text)",
                          fontSize: "0.875rem",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "var(--primary)";
                          e.target.style.boxShadow = "0 0 0 2px var(--primary-light)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "var(--border)";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    ) : (
                      <span style={{ fontFamily: "monospace" }}>{safeNumber(stock.shares || stock.units).toFixed(4)}</span>
                    )}
                  </td>

                  {/* Buy Price */}
                  <td style={{ padding: "0.75rem" }}>
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.buyPrice}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setEditForm({ ...editForm, buyPrice: e.target.value })
                        }
                        style={{
                          width: "100px",
                          padding: "0.375rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                          color: "var(--text)",
                          fontSize: "0.875rem",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "var(--primary)";
                          e.target.style.boxShadow = "0 0 0 2px var(--primary-light)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "var(--border)";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    ) : (
                      formatCurrencyForCountry(stock.buyPrice, stock.country || "United States")
                    )}
                  </td>

                  <td style={{ padding: "0.75rem", fontFamily: "monospace", fontWeight: 500 }}>
                    {stock.currentPrice
                      ? formatCurrencyForCountry(stock.currentPrice, stock.country || "United States")
                      : "—"}
                  </td>
                  <td style={{ padding: "0.75rem", fontFamily: "monospace", fontWeight: 600 }}>
                    {formatCurrencyForCountry(
                      stock.marketValue || stock.currentValue,
                      stock.country || "United States"
                    )}
                  </td>

                  <td
                    style={{
                      padding: "0.75rem",
                      color: positive ? "var(--success)" : "var(--danger)",
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {formatCurrencyForCountry(profitLoss, stock.country || "United States")}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "0.75rem" }} onClick={(e) => e.stopPropagation()}>
                    {editing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => handleSaveEdit(stock.id)}
                          disabled={updateMutation.isPending}
                          style={{
                            fontSize: "0.875rem",
                            padding: "0.375rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: updateMutation.isPending ? "var(--bg-secondary)" : "var(--primary)",
                            color: updateMutation.isPending ? "var(--text-muted)" : "var(--text-inverse)",
                            cursor: updateMutation.isPending ? "not-allowed" : "pointer",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                          }}
                        >
                          {updateMutation.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={updateMutation.isPending}
                          style={{
                            fontSize: "0.875rem",
                            padding: "0.375rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!updateMutation.isPending) {
                              e.target.style.background = "var(--bg-secondary)";
                              e.target.style.color = "var(--text)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "transparent";
                            e.target.style.color = "var(--text-secondary)";
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(stock);
                          }}
                          style={{
                            fontSize: "0.875rem",
                            padding: "0.375rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--text)",
                            cursor: "pointer",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = "var(--primary-light)";
                            e.target.style.borderColor = "var(--primary)";
                            e.target.style.color = "var(--primary)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "var(--bg)";
                            e.target.style.borderColor = "var(--border)";
                            e.target.style.color = "var(--text)";
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(stock.id);
                          }}
                          style={{
                            fontSize: "0.875rem",
                            padding: "0.375rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--danger)",
                            background: "var(--danger)",
                            color: "var(--text-inverse)",
                            cursor: "pointer",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = "var(--danger-light)";
                            e.target.style.borderColor = "var(--danger)";
                            e.target.style.color = "var(--danger)";
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = "var(--danger)";
                            e.target.style.borderColor = "var(--danger)";
                            e.target.style.color = "var(--text-inverse)";
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Stocks;
