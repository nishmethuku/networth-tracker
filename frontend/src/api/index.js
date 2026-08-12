/**
 * Main API module - exports all API functions with data mapping
 */

import api from "./client";
import { mapAsset, mapSummary, mapAnalytics } from "./mappers";
import { safeNumber } from "../utils/formatters";

/**
 * Fetch all assets with optional filters
 * @param {Object} filters - Optional filters {assetType, country, account, tag}
 */
export async function fetchAssets(filters = {}) {
  const params = new URLSearchParams();
  if (filters.assetType) params.append("asset_type", filters.assetType);
  if (filters.country) params.append("country", filters.country);
  if (filters.account) params.append("account", filters.account);
  if (filters.tag) params.append("tag", filters.tag);
  if (filters.householdId) params.append("household_id", filters.householdId);

  const endpoint = params.toString() ? `/assets?${params.toString()}` : "/assets";
  const data = await api.get(endpoint);
  return (data || []).map(mapAsset);
}

/**
 * Fetch dashboard summary
 */
export async function fetchSummary(filters = {}) {
  const params = new URLSearchParams();
  if (filters.assetType) params.append("asset_type", filters.assetType);
  if (filters.country) params.append("country", filters.country);
  if (filters.householdId) params.append("household_id", filters.householdId);
  const endpoint = params.toString() ? `/summary?${params.toString()}` : "/summary";
  const data = await api.get(endpoint);
  return mapSummary(data);
}

/**
 * Fetch analytics data
 */
export async function fetchAnalytics(householdId = null) {
  const endpoint = householdId ? `/analytics?household_id=${householdId}` : "/analytics";
  const data = await api.get(endpoint);
  return mapAnalytics(data);
}

/**
 * Fetch stocks (uses dedicated /stocks endpoint)
 */
export async function fetchStocks() {
  const data = await api.get("/stocks");
  // The /stocks endpoint returns already-formatted stock data
  return (data || []).map((stock) => ({
    id: stock.id ?? null,
    symbol: stock.symbol ?? stock.ticker ?? null,
    ticker: stock.ticker ?? stock.symbol ?? null,
    assetType: stock.asset_type ?? "stock",
    units: safeNumber(stock.units ?? stock.shares),
    shares: safeNumber(stock.shares ?? stock.units),
    buyPrice: safeNumber(stock.buy_price),
    currentPrice: safeNumber(stock.current_price),
    buyValue: safeNumber(stock.buy_value),
    currentValue: safeNumber(stock.current_value),
    marketValue: safeNumber(stock.market_value ?? stock.current_value),
    profit: safeNumber(stock.profit),
    profitLoss: safeNumber(stock.profit_loss ?? stock.profit),
    profitPercent: safeNumber(stock.profit_pct),
    cagr: safeNumber(stock.cagr),
    country: stock.country ?? "",
    account: stock.account ?? "",
    purchaseDate: stock.purchase_date ?? "",
    createdAt: stock.created_at ?? "",
  }));
}

/**
 * Create a new asset
 */
export async function createAsset(assetData) {
  const data = await api.post("/assets", assetData);
  return mapAsset(data);
}

/**
 * Update an asset
 */
export async function updateAsset(id, assetData) {
  const data = await api.put(`/assets/${id}`, assetData);
  return mapAsset(data);
}

/**
 * Delete an asset
 */
export async function deleteAsset(id) {
  await api.delete(`/assets/${id}`);
}

/**
 * Fetch a single asset by ID
 */
export async function fetchAsset(id) {
  const assets = await fetchAssets();
  return assets.find((a) => a.id === parseInt(id)) || null;
}

/**
 * Search for stock symbols (autocomplete)
 * @param {string} query - Search query
 * @param {string} country - Optional country filter
 * @param {string} assetType - Optional asset type filter (e.g., "mutual_fund", "stock")
 */
export async function searchSymbols(query, country = "", assetType = "") {
  if (!query || query.trim().length < 1) {
    return [];
  }
  const params = new URLSearchParams({ q: query.trim() });
  if (country) params.append("country", country);
  if (assetType) params.append("asset_type", assetType);
  const data = await api.get(`/search-symbols?${params.toString()}`);
  return data || [];
}

/**
 * Households / family sharing
 */
export async function fetchHouseholds() {
  return (await api.get("/households")) || [];
}

export async function createHousehold(name) {
  return api.post("/households", { name });
}

export async function fetchHouseholdMembers(householdId) {
  return (await api.get(`/households/${householdId}/members`)) || [];
}

export async function inviteToHousehold(householdId, email) {
  return api.post(`/households/${householdId}/invites`, { email });
}

export async function fetchMyInvites() {
  return (await api.get("/invites")) || [];
}

export async function acceptInvite(inviteId) {
  return api.post(`/invites/${inviteId}/accept`, {});
}

export async function leaveHousehold(householdId) {
  return api.post(`/households/${householdId}/leave`, {});
}

export async function removeHouseholdMember(householdId, userId) {
  return api.delete(`/households/${householdId}/members/${userId}`);
}

/**
 * Real daily net worth history (from net_worth_snapshots)
 */
export async function fetchNetWorthHistory(householdId = null) {
  const endpoint = householdId
    ? `/net-worth-history?household_id=${householdId}`
    : "/net-worth-history";
  return (await api.get(endpoint)) || [];
}

export { api } from "./client";
export { ApiError } from "./client";
