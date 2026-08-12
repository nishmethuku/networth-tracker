/**
 * Data mapping layer: Normalize backend responses into frontend-friendly objects
 * This ensures consistent field names and handles undefined/NaN values
 */

import { safeNumber } from "../utils/formatters";

/**
 * Map backend asset to frontend asset format
 * Backend sends both raw fields from to_dict() and computed fields separately
 * 
 * Special handling for grouped cash accounts (is_grouped === true)
 */
export function mapAsset(backendAsset) {
  if (!backendAsset) return null;

  // Handle grouped cash accounts
  if (backendAsset.is_grouped && backendAsset.asset_type === "cash") {
    return {
      id: backendAsset.id ?? null,
      assetType: backendAsset.asset_type ?? "cash",
      country: backendAsset.country ?? "",
      account: backendAsset.account ?? "",
      purchaseDate: backendAsset.purchase_date ?? "", // Last updated date
      createdAt: backendAsset.created_at ?? "", // First entry date
      
      // Identity fields
      institution: backendAsset.institution ?? backendAsset.account ?? "",
      
      // Cash account specific
      currentBalance: safeNumber(backendAsset.current_balance ?? backendAsset.current_value),
      currentValue: safeNumber(backendAsset.current_value ?? backendAsset.current_balance),
      buyValue: safeNumber(backendAsset.buy_value ?? backendAsset.current_balance),
      profit: 0,
      profitPercent: 0,
      cagr: 0,
      
      // History for grouped cash accounts
      history: (backendAsset.history || []).map((entry) => ({
        date: entry.date ?? "",
        balance: safeNumber(entry.balance),
        change: safeNumber(entry.change),
        entryId: entry.entry_id ?? null,
        notes: entry.notes ?? "",
        tags: entry.tags || [],
      })),
      entryCount: backendAsset.entry_count ?? 0,
      
      // Notes and tags (from latest entry)
      notes: backendAsset.notes ?? "",
      tags: backendAsset.tags ? backendAsset.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      
      // Display helpers
      displayName: backendAsset.institution ?? backendAsset.account ?? "Cash Account",
      isGrouped: true,
    };
  }

  // Regular asset mapping (non-grouped)
  return {
    id: backendAsset.id ?? null,
    assetType: backendAsset.asset_type ?? "unknown",
    country: backendAsset.country ?? "",
    account: backendAsset.account ?? "",
    purchaseDate: backendAsset.purchase_date ?? "",
    createdAt: backendAsset.created_at ?? "",

    // Identity fields
    symbol: backendAsset.symbol ?? null,
    name: backendAsset.name ?? null,
    institution: backendAsset.institution ?? null,

    // Market assets (stocks, mutual funds) - raw fields
    units: safeNumber(backendAsset.units),
    buyPrice: safeNumber(backendAsset.buy_price),

    // Real assets (real estate, metals) - raw fields
    rawBuyValue: safeNumber(backendAsset.buy_value),
    rawCurrentValue: safeNumber(backendAsset.current_value),

    // Cash/deposits/loans - raw fields
    value: safeNumber(backendAsset.value),

    // Computed values (from backend calculation)
    // These override the raw computed values from to_dict()
    buyValue: safeNumber(backendAsset.buy_value ?? backendAsset.buy_value),
    currentValue: safeNumber(backendAsset.current_value ?? backendAsset.current_value),
    profit: safeNumber(backendAsset.profit ?? 0),
    profitPercent: safeNumber(backendAsset.profit_pct ?? 0),
    cagr: safeNumber(backendAsset.cagr ?? 0),

    // Notes and tags
    notes: backendAsset.notes ?? "",
    tags: backendAsset.tags ? backendAsset.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],

    // Display helpers
    displayName:
      backendAsset.symbol ??
      backendAsset.name ??
      backendAsset.institution ??
      `Asset #${backendAsset.id ?? "?"}`,
    isGrouped: false,
  };
}

/**
 * Map backend summary to frontend summary format
 */
export function mapSummary(backendSummary) {
  if (!backendSummary) return null;

  return {
    totalNetWorth: safeNumber(backendSummary.total_net_worth),
    totalStockValue: safeNumber(backendSummary.total_stock_value),
    totalPropertyValue: safeNumber(backendSummary.total_property_value),
    totalProfitLoss: safeNumber(backendSummary.total_profit_loss),

    grandTotals: mapTotals(backendSummary.grand_totals),

    countries: (backendSummary.countries || []).map(mapCountry),
  };
}

/**
 * Map country structure
 */
function mapCountry(backendCountry) {
  return {
    country: backendCountry.country ?? "",
    totals: mapTotals(backendCountry.totals),
    accounts: (backendCountry.accounts || []).map(mapAccount),
  };
}

/**
 * Map account structure
 */
function mapAccount(backendAccount) {
  return {
    account: backendAccount.account ?? "",
    totals: mapTotals(backendAccount.totals),
    perStock: (backendAccount.per_stock || []).map(mapStockBucket),
  };
}

/**
 * Map stock bucket (aggregated stock holdings)
 */
function mapStockBucket(backendStock) {
  return {
    symbol: backendStock.symbol ?? null,
    assetType: backendStock.asset_type ?? "stock",
    country: backendStock.country ?? "",
    account: backendStock.account ?? "",
    units: safeNumber(backendStock.units),
    buyPrice: safeNumber(backendStock.buy_price),
    currentPrice: safeNumber(backendStock.current_price),
    buyValue: safeNumber(backendStock.buy_value),
    currentValue: safeNumber(backendStock.current_value),
    profit: safeNumber(backendStock.profit),
    profitPercent: safeNumber(backendStock.profit_pct),
    cagr: safeNumber(backendStock.cagr),
    earliestPurchaseDate: backendStock.earliest_purchase_date ?? "",
  };
}

/**
 * Map totals structure
 */
function mapTotals(backendTotals) {
  if (!backendTotals) {
    return {
      buyValue: 0,
      currentValue: 0,
      profit: 0,
      profitPercent: 0,
      cagr: 0,
    };
  }

  return {
    buyValue: safeNumber(backendTotals.buy_value),
    currentValue: safeNumber(backendTotals.current_value),
    profit: safeNumber(backendTotals.profit),
    profitPercent: safeNumber(backendTotals.profit_pct),
    cagr: safeNumber(backendTotals.cagr),
  };
}

/**
 * Map analytics data
 */
export function mapAnalytics(backendAnalytics) {
  if (!backendAnalytics) return null;

  return {
    netWorthOverTime: (backendAnalytics.net_worth_over_time || []).map((point) => ({
      date: point.date ?? "",
      netWorth: safeNumber(point.net_worth),
      assetsValue: safeNumber(point.assets_value),
    })),

    allocation: (backendAnalytics.allocation || []).map((item) => ({
      label: item.label ?? "Unknown",
      value: safeNumber(item.value),
      name: item.label ?? "Unknown", // For charts
    })),

    cagrHistogram: (backendAnalytics.cagr_histogram || []).map((item) => ({
      label: item.label ?? "Unknown",
      assetType: item.asset_type ?? "unknown",
      country: item.country ?? "",
      account: item.account ?? "",
      cagr: safeNumber(item.cagr),
      cagrPercent: safeNumber(item.cagr) * 100, // For charts
    })),
  };
}

