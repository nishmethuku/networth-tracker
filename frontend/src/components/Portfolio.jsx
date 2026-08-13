import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchHoldings, fetchHouseholds, deleteHolding, ApiError } from "../api";
import Card from "./Card";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, getAssetTypeLabel, isQuantityBased } from "../constants/enums";

const CURRENCIES = ["USD", "INR", "AUD"];

function HoldingsTable({ holdings, assetType, navigate, onDelete, currency }) {
  const quantityBased = isQuantityBased(assetType);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <th style={{ padding: "0.75rem 0.5rem" }}>Name</th>
            {quantityBased && <th style={{ padding: "0.75rem 0.5rem" }}>Quantity</th>}
            {quantityBased && <th style={{ padding: "0.75rem 0.5rem" }}>Avg Cost</th>}
            {quantityBased && <th style={{ padding: "0.75rem 0.5rem" }}>Current Price</th>}
            <th style={{ padding: "0.75rem 0.5rem" }}>Value</th>
            <th style={{ padding: "0.75rem 0.5rem" }}>Gain</th>
            {quantityBased && <th style={{ padding: "0.75rem 0.5rem" }}>Return (XIRR)</th>}
            <th style={{ padding: "0.75rem 0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const gain = quantityBased ? h.totalGain : h.gain;
            const positive = safeNumber(gain) >= 0;
            return (
              <tr
                key={h.id}
                style={{ borderBottom: "1px solid var(--border-light)", cursor: "pointer" }}
                onClick={() => navigate(`/portfolio/${h.id}`)}
              >
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <div style={{ fontWeight: 600 }}>{h.symbol || h.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {h.country}{h.account ? ` • ${h.account}` : ""}
                  </div>
                </td>
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                    {h.quantity != null ? h.quantity.toFixed(4) : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                    {h.avgCost != null ? formatCurrencyForDisplay(h.avgCost, h.currency, { includeCode: false }) : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace", fontWeight: 500 }}>
                    {h.currentPrice != null ? formatCurrencyForDisplay(h.currentPrice, h.currency, { includeCode: false }) : "—"}
                  </td>
                )}
                <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace", fontWeight: 600 }}>
                  {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: positive ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                  {gain != null ? `${positive ? "+" : ""}${formatCurrencyForDisplay(gain, h.currency, { includeCode: false })}` : "—"}
                </td>
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", color: h.xirr != null && h.xirr >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {h.xirr != null ? formatPercent(h.xirr * 100) : "—"}
                  </td>
                )}
                <td style={{ padding: "0.75rem 0.5rem" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDelete(h)}
                    style={{ fontSize: "0.8125rem", background: "var(--danger)", color: "white", padding: "0.35rem 0.75rem" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("USD");
  const [householdId, setHouseholdId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: households } = useQuery({ queryKey: ["households"], queryFn: fetchHouseholds });

  const {
    data: holdings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["holdings", currency, householdId],
    queryFn: () => fetchHoldings({ currency, householdId: householdId || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <LoadingState message="Loading portfolio..." />;
  if (isError) {
    return (
      <ErrorState error={error instanceof ApiError ? error.message : "Failed to load portfolio"} onRetry={refetch} />
    );
  }

  const grouped = (holdings || []).reduce((acc, h) => {
    (acc[h.assetType] = acc[h.assetType] || []).push(h);
    return acc;
  }, {});

  const orderedTypes = ASSET_TYPE_OPTIONS.map((o) => o.value).filter((t) => grouped[t]?.length);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Portfolio</h1>
          {households && households.length > 0 && (
            <select
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              style={{ padding: "0.5rem 0.875rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "0.875rem" }}
            >
              <option value="">Just me</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          )}
          <div style={{ display: "inline-flex", gap: "0.25rem", background: "var(--card)", borderRadius: "999px", padding: "0.25rem", border: "1px solid var(--border)" }}>
            {CURRENCIES.map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur)}
                style={{
                  border: "none", borderRadius: "999px", padding: "0.35rem 0.8rem", fontSize: "0.8rem", cursor: "pointer",
                  background: currency === cur ? "var(--primary)" : "transparent",
                  color: currency === cur ? "var(--text-inverse)" : "var(--text-secondary)",
                  fontWeight: currency === cur ? 600 : 500,
                }}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate("/add-holding")}
          style={{ padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600, fontSize: "0.9375rem", boxShadow: "var(--shadow)" }}
        >
          + Add Holding
        </button>
      </div>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        assetName={deleteTarget?.displayName}
      />

      {orderedTypes.length === 0 ? (
        <EmptyState
          message="No holdings yet. Add your first one!"
          action={
            <button onClick={() => navigate("/add-holding")} style={{ padding: "0.75rem 1.5rem", borderRadius: "var(--radius)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", cursor: "pointer", fontWeight: 600 }}>
              Add Holding
            </button>
          }
        />
      ) : (
        orderedTypes.map((type) => (
          <div key={type} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
              {getAssetTypeLabel(type)}
            </h2>
            <Card>
              <HoldingsTable
                holdings={grouped[type]}
                assetType={type}
                navigate={navigate}
                onDelete={setDeleteTarget}
                currency={currency}
              />
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
