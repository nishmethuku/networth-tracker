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
  avgCost: (h) => (h.quantity && h.displayCostBasis != null ? h.displayCostBasis / h.quantity : null),
  costBasis: (h) => h.displayCostBasis,
  currentPrice: (h) => (h.quantity && h.displayValue != null ? h.displayValue / h.quantity : null),
  value: (h) => h.displayValue,
  gain: (h) => (isQuantityBased(h.assetType) ? h.displayTotalGain : h.displayGain),
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

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort, hint }) {
  const active = currentSort === sortKey;
  return (
    <th style={{ padding: 0 }}>
      <button
        onClick={() => onSort(sortKey)}
        title={hint}
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
              <SortableHeader
                label="Annualized (XIRR)"
                sortKey="xirr"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                hint="Yearly rate of return that accounts for when each purchase was made."
              />
            )}
            {quantityBased && (
              <SortableHeader
                label="Total return"
                sortKey="growth"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={onSort}
                hint="Total gain since purchase as a percentage of what you paid. Not annualized."
              />
            )}
            <th style={{ padding: "0.75rem 0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const gain = quantityBased ? h.displayTotalGain : h.displayGain;
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
                {/* Avg Cost, Cost Basis, and Current Price all render in the
                    selected display currency, matching Value/Gain in the same
                    row -- showing a holding's own native currency here while
                    Value/Gain used the display currency mixed ₹ and $ in the
                    same row for an NSE stock being viewed in USD. */}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                    {h.quantity && h.displayCostBasis != null
                      ? formatCurrencyForDisplay(h.displayCostBasis / h.quantity, currency, { includeCode: false })
                      : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)" }}>
                    {h.displayCostBasis != null ? formatCurrencyForDisplay(h.displayCostBasis, currency, { includeCode: false }) : "—"}
                  </td>
                )}
                {quantityBased && (
                  <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {h.quantity && h.displayValue != null
                      ? formatCurrencyForDisplay(h.displayValue / h.quantity, currency, { includeCode: false })
                      : "—"}
                  </td>
                )}
                <td style={{ padding: "0.75rem 0.5rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {formatCurrencyForDisplay(h.displayValue, currency, { includeCode: false })}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: positive ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                  {/* display currency, matching the Value cell right above -- gain used to render in
                      the holding's own currency, mismatching the Value cell next to it and sorting
                      wrong across a mixed-currency portfolio (an INR gain would outrank a USD one). */}
                  {gain != null ? `${positive ? "+" : ""}${formatCurrencyForDisplay(gain, currency, { includeCode: false })}` : "—"}
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
                <td style={{ padding: "0.75rem 0.5rem", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="portfolio-row-action"
                    onClick={() => navigate(`/portfolio/${h.id}`)}
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

  // Rollup by account and country — used in the summary totals panel.
  const byAccount = filteredHoldings.reduce((acc, h) => {
    const key = h.account || "—";
    acc[key] = (acc[key] || 0) + (h.displayValue || 0);
    return acc;
  }, {});
  const byCountry = filteredHoldings.reduce((acc, h) => {
    const key = h.country || "—";
    acc[key] = (acc[key] || 0) + (h.displayValue || 0);
    return acc;
  }, {});
  const accountEntries = Object.entries(byAccount).sort(([, a], [, b]) => b - a);
  const countryEntries = Object.entries(byCountry).sort(([, a], [, b]) => b - a);
  const portfolioTotal = filteredHoldings.reduce((sum, h) => sum + (h.displayValue || 0), 0);

  function exportToCsv() {
    const cols = [
      "Name",
      "Symbol",
      "Type",
      "Country",
      "Account",
      "Currency",
      "Quantity",
      `Avg Cost (${currency})`,
      `Cost Basis (${currency})`,
      `Current Price (${currency})`,
      `Value (${currency})`,
      "Gain %",
    ];
    const rows = filteredHoldings.map((h) => {
      const pct = gainPct(h);
      const avgCost = h.quantity > 0 ? h.displayCostBasis / h.quantity : "";
      const curPrice = h.quantity > 0 ? h.displayValue / h.quantity : "";
      return [
        h.name,
        h.symbol || "",
        getAssetTypeLabel(h.assetType),
        h.country || "",
        h.account || "",
        h.currency,
        isQuantityBased(h.assetType) ? h.quantity : "",
        avgCost !== "" ? avgCost.toFixed(4) : "",
        h.displayCostBasis?.toFixed(2) ?? "",
        curPrice !== "" ? curPrice.toFixed(4) : "",
        h.displayValue?.toFixed(2) ?? "",
        pct != null ? pct.toFixed(2) + "%" : "n/a",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [cols.map((c) => `"${c}"`).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={exportToCsv}
            disabled={!filteredHoldings.length}
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--text)",
              cursor: filteredHoldings.length ? "pointer" : "not-allowed",
              fontWeight: 500,
              fontSize: "0.9375rem",
              opacity: filteredHoldings.length ? 1 : 0.5,
            }}
          >
            Export CSV
          </button>
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

      {orderedTypes.length > 0 && (accountEntries.length > 1 || countryEntries.length > 1) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {accountEntries.length > 1 && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "0.875rem 1.25rem",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>By Account</div>
              {accountEntries.map(([acct, val]) => (
                <div
                  key={acct}
                  style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", color: "var(--text-secondary)" }}
                >
                  <span>{acct}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                    {formatCurrencyForDisplay(val, currency, { includeCode: false })}
                    {portfolioTotal > 0 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "0.35rem" }}>
                        {((val / portfolioTotal) * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {countryEntries.length > 1 && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "0.875rem 1.25rem",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>By Country</div>
              {countryEntries.map(([cntry, val]) => (
                <div
                  key={cntry}
                  style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", color: "var(--text-secondary)" }}
                >
                  <span>{cntry}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                    {formatCurrencyForDisplay(val, currency, { includeCode: false })}
                    {portfolioTotal > 0 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "0.35rem" }}>
                        {((val / portfolioTotal) * 100).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
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
