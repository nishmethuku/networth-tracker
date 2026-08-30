import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { fetchHoldings, deleteHolding, ApiError } from "../api";
import Card from "./Card";
import PortfolioSkeleton from "./PortfolioSkeleton";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import HoldingCard from "./HoldingCard";
import useIsMobile from "../hooks/useIsMobile";
import { useHousehold } from "../contexts/HouseholdContext";
import { getDefaultDisplayCurrency } from "../hooks/useDisplayCurrencyPreference";
import { formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import { ASSET_TYPE_OPTIONS, getAssetTypeLabel, isQuantityBased } from "../constants/enums";
import { holdingGrowthPct as gainPct, groupBuyValueAndGain } from "../utils/holdingReturns";

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

// Column key -> a getter for that column's sort value. Kept here (not
// inline per-column) so the same key works across every asset-type table,
// even though each one only shows a subset of these columns.
const SORT_ACCESSORS = {
  name: (h) => (h.symbol || h.name || "").toLowerCase(),
  quantity: (h) => h.quantity,
  avgCost: (h) => h.avgCost,
  costBasis: (h) => h.costBasis,
  currentPrice: (h) => h.currentPrice,
  value: (h) => h.displayValue,
  gain: (h) => (isQuantityBased(h.assetType) ? h.totalGain : h.gain),
  xirr: (h) => h.xirr,
  growth: (h) => gainPct(h),
};

export function sortHoldings(holdings, sortKey, dir) {
  if (!sortKey || !SORT_ACCESSORS[sortKey]) return holdings;
  const accessor = SORT_ACCESSORS[sortKey];
  const sign = dir === "asc" ? 1 : -1;
  return [...holdings].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    if (typeof av === "string") return sign * av.localeCompare(bv);
    return sign * (av - bv);
  });
}

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort }) {
  const active = currentSort === sortKey;
  return (
    <th style={{ padding: 0 }}>
      <button
        onClick={() => onSort(sortKey)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.75rem 0.5rem",
          width: "100%",
          boxSizing: "border-box",
          fontWeight: active ? 700 : "inherit",
          color: active ? "var(--text)" : "inherit",
        }}
        aria-label={`Sort by ${label}${active ? (currentDir === "asc" ? ", ascending" : ", descending") : ""}`}
      >
        {label}
        {active && <span style={{ fontSize: "0.7rem" }}>{currentDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function HoldingsTable({ holdings, assetType, navigate, onDelete, currency, sortKey, sortDir, onSort }) {
  const quantityBased = isQuantityBased(assetType);
  const isMobile = useIsMobile();
  const sorted = sortHoldings(holdings, sortKey, sortDir);

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {sorted.map((h) => (
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
            <SortableHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            {quantityBased && (
              <SortableHeader label="Quantity" sortKey="quantity" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            )}
            {quantityBased && (
              <SortableHeader label="Avg Cost" sortKey="avgCost" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            )}
            {quantityBased && (
              <SortableHeader label="Cost Basis" sortKey="costBasis" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            )}
            {quantityBased && (
              <SortableHeader label="Current Price" sortKey="currentPrice" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            )}
            <SortableHeader label="Value" sortKey="value" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            <SortableHeader label="Gain" sortKey="gain" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            {quantityBased && (
              <SortableHeader label="Return (XIRR)" sortKey="xirr" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            )}
            {quantityBased && <SortableHeader label="Growth" sortKey="growth" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />}
            <th style={{ padding: "0.75rem 0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const gain = quantityBased ? h.totalGain : h.gain;
            const positive = safeNumber(gain) >= 0;
            return (
              <tr
                key={h.id}
                className="portfolio-row"
                style={{ borderBottom: "1px solid var(--border-light)", cursor: "pointer" }}
                onClick={() => navigate(`/portfolio/${h.id}`)}
              >
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <div style={{ fontWeight: 600 }}>{h.symbol || h.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {h.country}
                    {h.account ? ` • ${h.account}` : ""}
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
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                    {h.costBasis != null ? formatCurrencyForDisplay(h.costBasis, h.currency, { includeCode: false }) : "—"}
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
                  <td
                    style={{ padding: "0.75rem 0.5rem", color: gainPct(h) != null && gainPct(h) >= 0 ? "var(--success)" : "var(--danger)" }}
                  >
                    {gainPct(h) != null ? formatPercent(gainPct(h)) : "—"}
                  </td>
                )}
                <td style={{ padding: "0.75rem 0.5rem" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="portfolio-row-action"
                    onClick={() => onDelete(h)}
                    style={{
                      fontSize: "0.8125rem",
                      background: "var(--danger)",
                      color: "white",
                      padding: "0.35rem 0.75rem",
                    }}
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
    location.state?.aiFilterSpec ? { spec: location.state.aiFilterSpec, query: location.state.aiFilterQuery } : null,
  );
  // Per-asset-type account filter -- "Stocks" and "Mutual Funds" etc. each
  // get their own independent dropdown, since the same account name
  // rarely spans types (a brokerage doesn't also hold your real estate).
  // Keyed by asset type; an empty/missing value means "All accounts".
  const [accountFilters, setAccountFilters] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const sortKey = searchParams.get("sort");
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  function handleSort(key) {
    const next = new URLSearchParams(searchParams);
    if (sortKey === key) {
      next.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", key);
      next.set("dir", "desc");
    }
    setSearchParams(next, { replace: true });
  }

  // Instant client-side filter over the already-fetched holdings — separate
  // from the AI-powered natural-language search above, which re-derives a
  // filter spec from a typed sentence. This just matches name/ticker/account
  // substrings as you type, debounced so it doesn't re-filter every
  // keystroke on a large portfolio.
  const [filterInput, setFilterInput] = useState("");
  const [filterText, setFilterText] = useState("");
  const filterTimer = useRef(null);
  function handleFilterChange(e) {
    const val = e.target.value;
    setFilterInput(val);
    clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => setFilterText(val), 200);
  }

  const { currentHouseholdId } = useHousehold();

  const {
    data: holdings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["holdings", "summary", currency, currentHouseholdId],
    queryFn: () => fetchHoldings({ currency, summary: true, householdId: currentHouseholdId }),
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
    return <ErrorState error={error instanceof ApiError ? error.message : "Failed to load portfolio"} onRetry={refetch} />;
  }

  const aiFiltered = aiFilter ? (holdings || []).filter((h) => matchesFilterSpec(h, aiFilter.spec)) : holdings || [];
  const needle = filterText.trim().toLowerCase();
  const filteredHoldings = needle
    ? aiFiltered.filter((h) => `${h.name} ${h.symbol || ""} ${h.account || ""}`.toLowerCase().includes(needle))
    : aiFiltered;

  const grouped = filteredHoldings.reduce((acc, h) => {
    (acc[h.assetType] = acc[h.assetType] || []).push(h);
    return acc;
  }, {});

  const orderedTypes = ASSET_TYPE_OPTIONS.map((o) => o.value).filter((t) => grouped[t]?.length);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Portfolio</h1>
          <div
            style={{
              display: "inline-flex",
              gap: "0.25rem",
              background: "var(--card)",
              borderRadius: "999px",
              padding: "0.25rem",
              border: "1px solid var(--border)",
            }}
          >
            {CURRENCIES.map((cur) => (
              <button
                key={cur}
                onClick={() => setCurrency(cur)}
                style={{
                  border: "none",
                  borderRadius: "999px",
                  padding: "0.35rem 0.8rem",
                  fontSize: "0.8rem",
                  cursor: "pointer",
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
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.9375rem",
            boxShadow: "var(--shadow)",
          }}
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

      {holdings && holdings.length > 0 && (
        <input
          type="text"
          value={filterInput}
          onChange={handleFilterChange}
          placeholder="Filter by name, ticker, or account..."
          aria-label="Filter holdings by name, ticker, or account"
          style={{
            width: "100%",
            maxWidth: "360px",
            marginBottom: "1.25rem",
            padding: "0.625rem 0.875rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            fontSize: "0.875rem",
          }}
        />
      )}

      {aiFilter && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.25rem",
            padding: "0.5rem 0.875rem",
            borderRadius: "var(--radius)",
            background: "var(--primary-light)",
            border: "1px solid var(--border)",
            width: "fit-content",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--primary-dark)" }}>✨ Filtered by: "{aiFilter.query}"</span>
          <button
            onClick={() => setAiFilter(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary-dark)",
              cursor: "pointer",
              fontSize: "0.8125rem",
              fontWeight: 600,
              padding: 0,
            }}
          >
            Clear ×
          </button>
        </div>
      )}

      {orderedTypes.length === 0 && aiFilter ? (
        <EmptyState message={`No holdings match "${aiFilter.query}".`} />
      ) : orderedTypes.length === 0 && needle ? (
        <EmptyState message={`No holdings match "${filterInput}".`} />
      ) : orderedTypes.length === 0 && holdings && holdings.length > 0 ? (
        <EmptyState message="No holdings match the current filter." />
      ) : orderedTypes.length === 0 ? (
        <EmptyState
          message="No holdings yet. Add your first one!"
          action={
            <button
              onClick={() => navigate("/add-holding")}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius)",
                border: "none",
                background: "var(--primary)",
                color: "var(--text-inverse)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Add Holding
            </button>
          }
        />
      ) : (
        orderedTypes.map((type) => {
          const typeHoldings = grouped[type];
          const accounts = [...new Set(typeHoldings.map((h) => h.account).filter(Boolean))].sort();
          const selectedAccount = accountFilters[type] || "";
          const displayedHoldings = selectedAccount ? typeHoldings.filter((h) => h.account === selectedAccount) : typeHoldings;
          const { buyValue, gainAmount } = groupBuyValueAndGain(displayedHoldings);
          const totalValue = displayedHoldings.reduce((sum, h) => sum + (h.displayValue || 0), 0);

          return (
            <div key={type} style={{ marginBottom: "2rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text)" }}>{getAssetTypeLabel(type)}</h2>
                {accounts.length > 0 && (
                  <select
                    value={selectedAccount}
                    onChange={(e) => setAccountFilters({ ...accountFilters, [type]: e.target.value })}
                    aria-label={`Filter ${getAssetTypeLabel(type)} by account`}
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--text)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <option value="">All accounts</option>
                    {accounts.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {accounts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "1.5rem",
                    flexWrap: "wrap",
                    marginBottom: "0.75rem",
                    padding: "0.625rem 1rem",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius)",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    Total cost{" "}
                    <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                      {buyValue != null ? formatCurrencyForDisplay(buyValue, currency, { includeCode: false }) : "—"}
                    </strong>
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Current value{" "}
                    <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                      {formatCurrencyForDisplay(totalValue, currency, { includeCode: false })}
                    </strong>
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Profit/Loss{" "}
                    <strong
                      style={{
                        color: gainAmount == null ? "var(--text)" : gainAmount >= 0 ? "var(--success)" : "var(--danger)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {gainAmount != null
                        ? `${gainAmount >= 0 ? "+" : ""}${formatCurrencyForDisplay(gainAmount, currency, { includeCode: false })}`
                        : "—"}
                    </strong>
                  </span>
                </div>
              )}

              <Card>
                <HoldingsTable
                  holdings={displayedHoldings}
                  assetType={type}
                  navigate={navigate}
                  onDelete={setDeleteTarget}
                  currency={currency}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </Card>
            </div>
          );
        })
      )}
    </div>
  );
}
