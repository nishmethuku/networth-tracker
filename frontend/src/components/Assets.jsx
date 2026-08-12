import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import FilterBar from "./FilterBar";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { fetchAssets, deleteAsset, ApiError } from "../api";
import { formatCurrencyForCountry, safeNumber } from "../utils/formatters";

export default function Assets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [filters, setFilters] = useState({});

  const {
    data: assets,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => fetchAssets(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      setDeleteConfirmId(null);
    },
  });

  function handleDelete(assetId) {
    deleteMutation.mutate(assetId);
  }

  if (isLoading) {
    return <LoadingState message="Loading assets..." />;
  }

  if (isError) {
    return (
      <ErrorState
        error={error instanceof ApiError ? error.message : "Failed to load assets"}
        onRetry={refetch}
        message="Could not fetch assets. Please try again."
      />
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <EmptyState
        message="No assets yet. Add your first one!"
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
            Add Asset
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Assets</h1>
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
          + Add Asset
        </button>
      </div>

      <FilterBar onFilterChange={setFilters} />

      <ConfirmDeleteModal
        isOpen={deleteConfirmId !== null}
        onConfirm={() => handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        assetName={
          assets.find((a) => a.id === deleteConfirmId)?.displayName || "this asset"
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {assets.map((asset) => {
          // Check if this is a grouped cash account
          if (asset.isGrouped && asset.assetType === "cash") {
            return <CashAccountCard key={asset.id} asset={asset} navigate={navigate} setDeleteConfirmId={setDeleteConfirmId} />;
          }

          // Regular asset rendering (non-cash or non-grouped)
          const profit = safeNumber(asset.profit);
          const positive = profit >= 0;
          const displayName = asset.displayName || `Asset #${asset.id}`;

          // Build subtitle based on asset type
          const typeLabel = asset.assetType
            ? asset.assetType.replace("_", " ").toUpperCase()
            : "ASSET";
          let subtitleParts = [typeLabel];
          if (asset.country) {
            subtitleParts.push(asset.country);
          }

          // For stocks and real estate, hide the account in the subtitle.
          // For cash/deposit/loan, also avoid showing institution/account here.
          if (
            asset.assetType !== "stock" &&
            asset.assetType !== "real_estate" &&
            asset.assetType !== "cash" &&
            asset.assetType !== "deposit" &&
            asset.assetType !== "loan"
          ) {
            if (asset.account) {
              subtitleParts.push(asset.account);
            }
          }

          const subtitle = subtitleParts.join(" • ");

          return (
            <Card
              key={asset.id}
              title={displayName}
              subtitle={subtitle}
            >
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  Purchase Date: {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : "—"}
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Current Value:</strong>{" "}
                  {formatCurrencyForCountry(asset.currentValue, asset.country, 2, { includeCode: true })}
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Buy Value:</strong>{" "}
                  {formatCurrencyForCountry(asset.buyValue, asset.country, 2, { includeCode: true })}
                </p>
                <p
                  style={{
                    color: positive ? "var(--success)" : "var(--danger)",
                    marginBottom: "0.5rem",
                    fontWeight: 500,
                  }}
                  >
                  {positive ? "+" : ""}{formatCurrencyForCountry(profit, asset.country)} ({positive ? "+" : ""}{asset.profitPercent.toFixed(2)}%)
                </p>
                {asset.cagr !== 0 && (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                    CAGR: {(asset.cagr * 100).toFixed(2)}%
                  </p>
                )}

                {asset.tags && asset.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.75rem" }}>
                    {asset.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: "0.25rem 0.5rem",
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {asset.notes && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                      marginBottom: "0.75rem",
                      maxHeight: "60px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={asset.notes}
                  >
                    {asset.notes.length > 100 ? `${asset.notes.substring(0, 100)}...` : asset.notes}
                  </p>
                )}

                {asset.assetType === "stock" || asset.assetType === "mutual_fund" ? (
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div>Units: {safeNumber(asset.units).toFixed(4)}</div>
                    <div>
                      Buy Price:{" "}
                      {formatCurrencyForCountry(asset.buyPrice, asset.country)}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                  <button
                    onClick={() => navigate(`/assets/${asset.id}/edit`)}
                    style={{ flex: 1, fontSize: "0.875rem" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(asset.id)}
                    style={{
                      flex: 1,
                      fontSize: "0.875rem",
                      background: "var(--danger)",
                      color: "white",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Cash Account Card Component
 * Displays grouped cash accounts with current balance and transaction history
 */
function CashAccountCard({ asset, navigate, setDeleteConfirmId }) {
  const [showHistory, setShowHistory] = useState(false);
  
  const displayName = asset.displayName || asset.account || "Cash Account";
  const subtitle = `CASH • ${asset.country || ""}${asset.account ? ` • ${asset.account}` : ""}`.trim();
  const currentBalance = safeNumber(asset.currentBalance || asset.currentValue);
  const lastUpdated = asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : "—";
  
  return (
    <Card
      title={displayName}
      subtitle={subtitle}
    >
      <div style={{ marginTop: "0.75rem" }}>
        {/* Current Balance - Prominently Displayed */}
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ marginBottom: "0.25rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Current Balance
          </p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.5rem" }}>
            {formatCurrencyForCountry(currentBalance, asset.country, 2, { includeCode: true })}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Last updated: {lastUpdated}
          </p>
          {asset.entryCount > 1 && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {asset.entryCount} balance entries
            </p>
          )}
        </div>

        {/* Tags */}
        {asset.tags && asset.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.75rem" }}>
            {asset.tags.map((tag, idx) => (
              <span
                key={idx}
                style={{
                  padding: "0.25rem 0.5rem",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Notes */}
        {asset.notes && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              fontStyle: "italic",
              marginBottom: "0.75rem",
              maxHeight: "60px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={asset.notes}
          >
            {asset.notes.length > 100 ? `${asset.notes.substring(0, 100)}...` : asset.notes}
          </p>
        )}

        {/* Transaction History Toggle */}
        {asset.history && asset.history.length > 0 && (
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                width: "100%",
                padding: "0.5rem",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
            >
              {showHistory ? "▼" : "▶"} {showHistory ? "Hide" : "Show"} Transaction History
            </button>

            {/* History Table */}
            {showHistory && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: "var(--radius)",
                  maxHeight: "300px",
                  overflowY: "auto",
                }}
              >
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>Date</th>
                      <th style={{ padding: "0.5rem", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>Balance</th>
                      <th style={{ padding: "0.5rem", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.history.map((entry, idx) => {
                      const change = safeNumber(entry.change);
                      const isPositive = change >= 0;
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.5rem", color: "var(--text)" }}>
                            {entry.date ? new Date(entry.date).toLocaleDateString() : "—"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text)" }}>
                            {formatCurrencyForCountry(entry.balance, asset.country, 2)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem",
                              textAlign: "right",
                              color: isPositive ? "var(--success)" : "var(--danger)",
                              fontWeight: 500,
                            }}
                          >
                            {isPositive ? "+" : ""}{formatCurrencyForCountry(change, asset.country, 2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Note: Individual cash entries cannot be edited/deleted from grouped view */}
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "0.5rem" }}>
          To edit or delete individual entries, remove the Cash filter
        </div>
      </div>
    </Card>
  );
}
