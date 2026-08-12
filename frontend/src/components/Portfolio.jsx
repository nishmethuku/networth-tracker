import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchAssets, fetchSummary, fetchAnalytics, fetchHouseholds, deleteAsset, ApiError } from "../api";
import Card from "./Card";
import { convertCountryValueToDisplay, convertCurrency, formatCurrency, formatCurrencyCompact, formatCurrencyForCountry, formatCurrencyForDisplay, formatPercent, safeNumber } from "../utils/formatters";
import LoadingState from "./LoadingState";
import ErrorState from "./ErrorState";
import EmptyState from "./EmptyState";
import FilterBar from "./FilterBar";

const ASSET_TYPE_LABELS = {
  stock: "Stock",
  mutual_fund: "Mutual Fund",
  real_estate: "Real Estate",
  metal: "Metal",
  cash: "Cash",
  deposit: "Deposit",
  loan: "Loan",
};

function ConfirmDeleteModal({ isOpen, onConfirm, onCancel, assetName }) {
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
        <h3 style={{ marginBottom: "1rem" }}>Delete Asset?</h3>
        <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)" }}>
          Are you sure you want to delete {assetName}? This action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={onConfirm}
            style={{ background: "var(--danger)", color: "white" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, assets, onDelete, navigate, displayCurrency = "INR" }) {
  const [open, setOpen] = useState(false);

  // Calculate totals with proper currency conversion to display currency
  const totals = assets.reduce(
    (acc, a) => {
      const country = a.country || "United States";
      // Convert each value to display currency before summing
      const buyValue = convertCountryValueToDisplay(safeNumber(a.buyValue), country, displayCurrency);
      const currentValue = convertCountryValueToDisplay(safeNumber(a.currentValue), country, displayCurrency);
      const profit = convertCountryValueToDisplay(safeNumber(a.profit), country, displayCurrency);
      
      acc.buy += safeNumber(buyValue);
      acc.current += safeNumber(currentValue);
      acc.profit += safeNumber(profit);
      return acc;
    },
    { buy: 0, current: 0, profit: 0 }
  );

  const profitPercent =
    totals.buy > 0 ? ((totals.profit / totals.buy) * 100).toFixed(2) : "0.00";

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          padding: "1rem 1.5rem",
          background: "rgba(255,255,255,0.02)",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {title} ({assets.length})
        </span>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "var(--text-secondary)" }}>
            Value: {formatCurrencyCompact(totals.current, displayCurrency)} |{" "}
            <span
              style={{
                color: totals.profit >= 0 ? "var(--success)" : "var(--danger)",
              }}
            >
              P/L: {formatCurrencyCompact(totals.profit, displayCurrency)} ({profitPercent}%)
            </span>
          </span>
          <span style={{ fontSize: "1.2rem" }}>{open ? "▼" : "▶"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "1.5rem" }}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <th style={{ padding: "0.75rem" }}>Name</th>
                  <th style={{ padding: "0.75rem" }}>Buy Value</th>
                  <th style={{ padding: "0.75rem" }}>Current Value</th>
                  <th style={{ padding: "0.75rem" }}>P/L</th>
                  <th style={{ padding: "0.75rem" }}>P/L %</th>
                  <th style={{ padding: "0.75rem" }}>CAGR</th>
                  <th style={{ padding: "0.75rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const country = asset.country || "United States";
                  // Convert all values to display currency
                  const buyValue = convertCountryValueToDisplay(safeNumber(asset.buyValue), country, displayCurrency);
                  const currentValue = convertCountryValueToDisplay(safeNumber(asset.currentValue), country, displayCurrency);
                  const profit = convertCountryValueToDisplay(safeNumber(asset.profit), country, displayCurrency);
                  const profitPercent = safeNumber(asset.profitPercent);
                  const positive = profit >= 0;
                  const displayName = asset.displayName || `Asset #${asset.id}`;

                  return (
                    <tr
                      key={asset.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <td style={{ padding: "0.75rem" }}>{displayName}</td>
                      <td style={{ padding: "0.75rem" }}>
                        {formatCurrencyForDisplay(buyValue, displayCurrency)}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        {formatCurrencyForDisplay(currentValue, displayCurrency)}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem",
                          color: positive ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {positive ? "+" : ""}{formatCurrencyForDisplay(profit, displayCurrency)}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem",
                          color: positive ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {positive ? "+" : ""}{profitPercent.toFixed(2)}%
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        {(safeNumber(asset.cagr) * 100).toFixed(2)}%
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            onClick={() => navigate(`/assets/${asset.id}/edit`)}
                            style={{ fontSize: "0.875rem" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete(asset.id)}
                            style={{
                              fontSize: "0.875rem",
                              background: "var(--danger)",
                              color: "white",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CountryHoldingsSection({ country, isOpenDefault = false }) {
  const [open, setOpen] = useState(isOpenDefault);
  const countryName = country?.country || "Unknown";
  const totals = country?.totals || {};
  const accounts = country?.accounts || [];

  return (
    <div
      style={{
        marginBottom: "1.25rem",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          padding: "1rem 1.5rem",
          background: "rgba(255,255,255,0.02)",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span>
          {countryName} ({accounts.length})
        </span>
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "var(--text-secondary)" }}>
            Value: {formatCurrencyForCountry(totals.currentValue, countryName)} |{" "}
            <span style={{ color: safeNumber(totals.profit) >= 0 ? "var(--success)" : "var(--danger)" }}>
              P/L: {formatCurrencyForCountry(totals.profit, countryName)} ({formatPercent(totals.profitPercent)})
            </span>
          </span>
          <span style={{ fontSize: "1.2rem" }}>{open ? "▼" : "▶"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "1.25rem 1.5rem" }}>
          {accounts.length === 0 ? (
            <EmptyState message="No accounts in this country yet." />
          ) : (
            accounts.map((account) => (
              <AccountHoldingsSection
                key={`${countryName}-${account.account}`}
                countryName={countryName}
                account={account}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AccountHoldingsSection({ countryName, account }) {
  const [open, setOpen] = useState(false);
  const totals = account?.totals || {};
  const perStock = account?.perStock || [];

  return (
    <div
      style={{
        marginBottom: "1rem",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          padding: "0.9rem 1rem",
          background: "rgba(255,255,255,0.015)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 600 }}>Account: {account?.account || "Unknown"}</span>
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-secondary)" }}>
            Value: {formatCurrencyForCountry(totals.currentValue, countryName)} |{" "}
            <span style={{ color: safeNumber(totals.profit) >= 0 ? "var(--success)" : "var(--danger)" }}>
              P/L: {formatCurrencyForCountry(totals.profit, countryName)} ({formatPercent(totals.profitPercent)})
            </span>
          </span>
          <span style={{ fontSize: "1.1rem" }}>{open ? "▼" : "▶"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "1rem" }}>
          {perStock.length === 0 ? (
            <EmptyState message="No stock/mutual fund positions in this account." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.85rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                      fontWeight: 600,
                      color: "var(--text)",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Symbol</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Type</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Units</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Buy Price</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Current Price</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Buy Value</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>Current Value</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>P / L</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>P / L %</th>
                    <th style={{ padding: "0.75rem 0.5rem", fontSize: "0.8125rem" }}>CAGR</th>
                  </tr>
                </thead>
                <tbody>
                  {perStock.map((stock, idx) => {
                    const profit = safeNumber(stock.profit);
                    const positive = profit >= 0;
                    return (
                      <tr
                        key={stock.symbol || `${account?.account}-${idx}`}
                        style={{
                          borderBottom: "1px solid var(--border-light)",
                          transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>
                          {stock.symbol || "—"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {stock.assetType}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {safeNumber(stock.units).toFixed(4)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {formatCurrencyForCountry(stock.buyPrice, countryName, 4)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                            fontWeight: 500,
                          }}
                        >
                          {formatCurrencyForCountry(stock.currentPrice, countryName, 4)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {formatCurrencyForCountry(stock.buyValue, countryName)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrencyForCountry(stock.currentValue, countryName)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            color: positive ? "var(--success)" : "var(--danger)",
                            fontWeight: 600,
                          }}
                        >
                          {formatCurrencyForCountry(profit, countryName)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            color: positive ? "var(--success)" : "var(--danger)",
                            fontWeight: 600,
                          }}
                        >
                          {formatPercent(stock.profitPercent)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 0.5rem",
                            fontFamily: "monospace",
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {formatPercent(safeNumber(stock.cagr) * 100)}
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
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [filters, setFilters] = useState({});
  const [displayCurrency, setDisplayCurrency] = useState("INR");
  const [assetsByTypeCurrency, setAssetsByTypeCurrency] = useState("INR");
  const [householdId, setHouseholdId] = useState(""); // "" = my own portfolio

  const { data: households } = useQuery({
    queryKey: ["households"],
    queryFn: fetchHouseholds,
  });

  const scopedFilters = householdId ? { ...filters, householdId } : filters;

  const {
    data: assets,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assets", scopedFilters],
    queryFn: () => fetchAssets(scopedFilters),
  });

  // Fetch ALL summary for top cards + holdings drilldown (by country/account/stock)
  const {
    data: summaryAll,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["summary", "all", householdId],
    queryFn: () => fetchSummary(householdId ? { householdId } : {}),
  });

  // Fetch analytics for day P/L (net worth over time)
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ["analytics", "portfolio", householdId],
    queryFn: () => fetchAnalytics(householdId || null),
  });

  // NOTE: Hooks must be called unconditionally on every render.
  // Compute these with safe fallbacks so we don't violate hook ordering.
  const fullNetWorth = useMemo(() => {
    if (!summaryAll || !summaryAll.countries) return 0;
    return summaryAll.countries.reduce((acc, c) => {
      const v = convertCountryValueToDisplay(c?.totals?.currentValue || 0, c?.country, displayCurrency);
      return acc + safeNumber(v);
    }, 0);
  }, [summaryAll, displayCurrency]);

  const fullProfitLoss = useMemo(() => {
    if (!summaryAll || !summaryAll.countries) return 0;
    return summaryAll.countries.reduce((acc, c) => {
      const v = convertCountryValueToDisplay(c?.totals?.profit || 0, c?.country, displayCurrency);
      return acc + safeNumber(v);
    }, 0);
  }, [summaryAll, displayCurrency]);

  // Compute day P/L from analytics net worth over time (base USD), then convert to display currency
  const dayPLBase = useMemo(() => {
    if (!analytics?.netWorthOverTime || analytics.netWorthOverTime.length === 0) return 0;
    const series = analytics.netWorthOverTime;
    const last = safeNumber(series[series.length - 1]?.netWorth);
    const prev = safeNumber(series[Math.max(0, series.length - 2)]?.netWorth ?? last);
    return last - prev;
  }, [analytics]);

  const dayPL = useMemo(() => {
    // Assume analytics net worth is in USD base
    return convertCurrency(dayPLBase, "USD", displayCurrency);
  }, [dayPLBase, displayCurrency]);

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

  if (isLoading || isLoadingSummary || isLoadingAnalytics) {
    return <LoadingState message="Loading portfolio..." />;
  }

  if (isError || isSummaryError || isAnalyticsError) {
    return (
      <ErrorState
        error={
          error instanceof ApiError
            ? error.message
            : summaryError instanceof ApiError
            ? summaryError.message
            : analyticsError instanceof ApiError
            ? analyticsError.message
            : "Failed to load portfolio"
        }
        onRetry={() => {
          refetch();
          refetchSummary();
          refetchAnalytics();
        }}
        message="Could not fetch portfolio. Please try again."
      />
    );
  }

  if ((!assets || assets.length === 0) && (!summaryAll || (summaryAll.countries || []).length === 0)) {
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

  // Group assets by type
  const grouped = (assets || []).reduce((acc, asset) => {
    const type = asset.assetType || "unknown";
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(asset);
    return acc;
  }, {});

  const deletingAsset = assets.find((a) => a.id === deleteConfirmId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>Portfolio</h2>
          {households && households.length > 0 && (
            <select
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              style={{
                padding: "0.5rem 0.875rem",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              <option value="">Viewing: My Portfolio</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  Viewing: {h.name}
                </option>
              ))}
            </select>
          )}
        </div>
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

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card title="Net Worth" value={formatCurrencyCompact(fullNetWorth, displayCurrency)} />
        <Card
          title="Total P / L"
          value={formatCurrencyCompact(fullProfitLoss, displayCurrency)}
          subtitle={fullProfitLoss >= 0 ? "Profit" : "Loss"}
        />
        <Card
          title="Day P / L"
          value={formatCurrencyCompact(dayPL, displayCurrency)}
          subtitle={dayPL >= 0 ? "Profit Today" : "Loss Today"}
        />
      </div>

      {/* Currency toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
          Display Currency:
        </div>
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
          {["USD", "INR"].map((cur) => (
            <button
              key={cur}
              onClick={() => setDisplayCurrency(cur)}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.35rem 0.8rem",
                fontSize: "0.8rem",
                cursor: "pointer",
                background: displayCurrency === cur ? "var(--primary)" : "transparent",
                color: displayCurrency === cur ? "var(--text-inverse)" : "var(--text-secondary)",
                fontWeight: displayCurrency === cur ? 600 : 500,
              }}
            >
              {cur}
            </button>
          ))}
        </div>
      </div>

      <FilterBar onFilterChange={setFilters} />

      <ConfirmDeleteModal
        isOpen={deleteConfirmId !== null}
        onConfirm={() => handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        assetName={deletingAsset?.displayName || "this asset"}
      />

      {/* Holdings by Country / Account / Stock (collapsible) */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>
          Holdings by Country / Account / Stock
        </h3>
        {(summaryAll?.countries || []).length === 0 ? (
          <EmptyState message="No holdings yet." />
        ) : (
          (summaryAll.countries || []).map((country) => (
            <CountryHoldingsSection key={country.country} country={country} />
          ))
        )}
      </div>

      {/* Portfolio (grouped by asset type) */}
      <div style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
            Assets (by type)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              Display Currency:
            </label>
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
              {["USD", "INR"].map((cur) => (
                <button
                  key={cur}
                  onClick={() => setAssetsByTypeCurrency(cur)}
                  style={{
                    border: "none",
                    borderRadius: "999px",
                    padding: "0.35rem 0.8rem",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    background: assetsByTypeCurrency === cur ? "var(--primary)" : "transparent",
                    color: assetsByTypeCurrency === cur ? "var(--text-inverse)" : "var(--text-secondary)",
                    fontWeight: assetsByTypeCurrency === cur ? 600 : 500,
                  }}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
        </div>
        {Object.keys(grouped).map((type) => (
          <CollapsibleSection
            key={type}
            title={ASSET_TYPE_LABELS[type] || type.toUpperCase()}
            assets={grouped[type]}
            onDelete={setDeleteConfirmId}
            navigate={navigate}
            displayCurrency={assetsByTypeCurrency}
          />
        ))}
      </div>

    </div>
  );
}
