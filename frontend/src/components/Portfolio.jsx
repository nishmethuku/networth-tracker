import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchHoldings, deleteHolding, ApiError } from "../api";
import Card from "./Card";
import PortfolioSkeleton from "./PortfolioSkeleton";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import HoldingCard from "./HoldingCard";
import useIsMobile from "../hooks/useIsMobile";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, getAssetTypeLabel, isQuantityBased } from "../constants/enums";
import { holdingGrowthPct as gainPct } from "../utils/holdingReturns";

const CURRENCIES = ["USD", "INR", "AUD"];

/** Applies an AI-generated filter spec (see backend/ai_service.py's
 * SEARCH_SYSTEM_PROMPT for the exact shape) against already-loaded holdings. */
function matchesFilterSpec(h, spec) {
  if (!spec) return true;
  if (spec.asset_types?.length && !spec.asset_types.includes(h.assetType)) return false;
  if (spec.countries?.length && !spec.countries.includes(h.country)) return false;
  if (spec.min_value != null && h.displayValue < spec.min_value) return false;
  if (spec.max_value != null && h.displayValue > spec.max_value) return false;

  const pct = gainPct(h);
  if (spec.min_gain_pct != null && (pct == null || pct < spec.min_gain_pct)) return false;
  if (spec.max_gain_pct != null && (pct == null || pct > spec.max_gain_pct)) return false;
  if (spec.gainers_only && (pct == null || pct <= 0)) return false;
  if (spec.losers_only && (pct == null || pct >= 0)) return false;

  if (spec.text) {
    const needle = spec.text.toLowerCase();
    const haystack = `${h.name} ${h.symbol || ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function HoldingsTable({ holdings, assetType, navigate, onDelete, currency }) {
  const quantityBased = isQuantityBased(assetType);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {holdings.map((h) => (
          <HoldingCard key={h.id} holding={h} currency={currency} onOpen={() => navigate(`/portfolio/${h.id}`)} onDelete={onDelete} />
        ))}
      </div>
    );
  }

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
            {quantityBased && <th style={{ padding: "0.75rem 0.5rem" }}>Growth</th>}
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
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                    {h.quantity != null ? h.quantity.toFixed(4) : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                    {h.avgCost != null ? formatCurrencyForDisplay(h.avgCost, h.currency, { includeCode: false }) : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {h.currentPrice != null ? formatCurrencyForDisplay(h.currentPrice, h.currency, { includeCode: false }) : "—"}
                  </td>
                )}
                <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
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
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", color: gainPct(h) != null && gainPct(h) >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {gainPct(h) != null ? formatPercent(gainPct(h)) : "—"}
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState(getDefaultDisplayCurrency);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [aiFilter, setAiFilter] = useState(
    location.state?.aiFilterSpec ? { spec: location.state.aiFilterSpec, query: location.state.aiFilterQuery } : null
  );

  const {
    data: holdings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["holdings", "summary", currency],
    queryFn: () => fetchHoldings({ currency, summary: true }),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <PortfolioSkeleton />;
  if (isError) {
    return (
      <ErrorState error={error instanceof ApiError ? error.message : "Failed to load portfolio"} onRetry={refetch} />
    );
  }

  const filteredHoldings = aiFilter ? (holdings || []).filter((h) => matchesFilterSpec(h, aiFilter.spec)) : holdings || [];

  const grouped = filteredHoldings.reduce((acc, h) => {
    (acc[h.assetType] = acc[h.assetType] || []).push(h);
    return acc;
  }, {});

  const orderedTypes = ASSET_TYPE_OPTIONS.map((o) => o.value).filter((t) => grouped[t]?.length);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Portfolio</h1>
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

      {aiFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem", padding: "0.5rem 0.875rem", borderRadius: "var(--radius)", background: "var(--primary-light)", border: "1px solid var(--border)", width: "fit-content" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--primary-dark)" }}>✨ Filtered by: "{aiFilter.query}"</span>
          <button
            onClick={() => setAiFilter(null)}
            style={{ background: "none", border: "none", color: "var(--primary-dark)", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, padding: 0 }}
          >
            Clear ×
          </button>
        </div>
      )}

      {orderedTypes.length === 0 && aiFilter ? (
        <EmptyState message={`No holdings match "${aiFilter.query}".`} />
      ) : orderedTypes.length === 0 ? (
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
