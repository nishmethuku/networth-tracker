/**
 * Main API module - exports all API functions with data mapping
 */

import api from "./client";
import {
  mapHolding,
  mapTransaction,
  mapValuation,
  mapDashboard,
  mapNetWorthHistory,
  mapPriceHistory,
  mapAlert,
  mapMilestone,
  mapTaxSummary,
  mapBenchmark,
} from "./mappers";

/**
 * Holdings
 */
export async function fetchHoldings(filters = {}) {
  const params = new URLSearchParams();
  if (filters.assetType) params.append("asset_type", filters.assetType);
  if (filters.country) params.append("country", filters.country);
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.currency) params.append("currency", filters.currency);
  const endpoint = params.toString() ? `/holdings?${params.toString()}` : "/holdings";
  const data = await api.get(endpoint);
  return (data || []).map(mapHolding);
}

export async function fetchHolding(id, currency = "USD") {
  const data = await api.get(`/holdings/${id}?currency=${currency}`);
  return mapHolding(data);
}

export async function createHolding(payload) {
  const data = await api.post("/holdings", payload);
  return mapHolding(data);
}

export async function updateHolding(id, payload) {
  const data = await api.put(`/holdings/${id}`, payload);
  return mapHolding(data);
}

export async function deleteHolding(id) {
  await api.delete(`/holdings/${id}`);
}

/**
 * Transactions (buy/sell ledger for stock/mutual_fund/crypto/commodity)
 */
export async function fetchHoldingTransactions(holdingId) {
  const data = await api.get(`/holdings/${holdingId}/transactions`);
  return (data || []).map(mapTransaction);
}

export async function createTransaction(holdingId, payload) {
  const data = await api.post(`/holdings/${holdingId}/transactions`, payload);
  return mapTransaction(data);
}

export async function updateTransaction(id, payload) {
  const data = await api.put(`/transactions/${id}`, payload);
  return mapTransaction(data);
}

export async function deleteTransaction(id) {
  await api.delete(`/transactions/${id}`);
}

export async function fetchAllTransactions(filters = {}) {
  const params = new URLSearchParams();
  if (filters.assetType) params.append("asset_type", filters.assetType);
  if (filters.country) params.append("country", filters.country);
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  const endpoint = params.toString() ? `/transactions?${params.toString()}` : "/transactions";
  const data = await api.get(endpoint);
  return (data || []).map(mapTransaction);
}

/**
 * Valuations (periodic value/balance entries for real_estate/fixed_deposit/ppf/epf/cash/loan)
 */
export async function fetchHoldingValuations(holdingId) {
  const data = await api.get(`/holdings/${holdingId}/valuations`);
  return (data || []).map(mapValuation);
}

export async function createValuation(holdingId, payload) {
  const data = await api.post(`/holdings/${holdingId}/valuations`, payload);
  return mapValuation(data);
}

export async function deleteValuation(id) {
  await api.delete(`/valuations/${id}`);
}

/**
 * Price history / lookup
 */
export async function fetchHoldingPriceHistory(holdingId) {
  const data = await api.get(`/holdings/${holdingId}/price-history`);
  return mapPriceHistory(data);
}

export async function priceLookup({ assetType, symbol, date, currency = "USD" }) {
  const params = new URLSearchParams({ asset_type: assetType, symbol, currency });
  if (date) params.append("date", date);
  const data = await api.get(`/price-lookup?${params.toString()}`);
  return data?.price ?? null;
}

/**
 * Dashboard / net worth history / exchange rates
 */
export async function fetchDashboard(filters = {}) {
  const params = new URLSearchParams();
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.currency) params.append("currency", filters.currency);
  const endpoint = params.toString() ? `/dashboard?${params.toString()}` : "/dashboard";
  const data = await api.get(endpoint);
  return mapDashboard(data);
}

export async function fetchNetWorthHistory(householdId = null) {
  const endpoint = householdId ? `/net-worth-history?household_id=${householdId}` : "/net-worth-history";
  const data = await api.get(endpoint);
  return mapNetWorthHistory(data);
}

export async function fetchExchangeRates(base = "USD") {
  return api.get(`/exchange-rates?base=${base}`);
}

/**
 * Symbol search (autocomplete)
 */
export async function searchSymbols(query, country = "", assetType = "") {
  if (!query || query.trim().length < 1) return [];
  const params = new URLSearchParams({ q: query.trim() });
  if (country) params.append("country", country);
  if (assetType) params.append("asset_type", assetType);
  const data = await api.get(`/search-symbols?${params.toString()}`);
  return data || [];
}

export async function searchCrypto(query) {
  if (!query || query.trim().length < 1) return [];
  const data = await api.get(`/search-crypto?q=${encodeURIComponent(query.trim())}`);
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

export async function inviteToHousehold(householdId, email, role = "editor") {
  return api.post(`/households/${householdId}/invites`, { email, role });
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
 * Price alerts
 */
export async function fetchAlerts() {
  const data = await api.get("/alerts");
  return (data || []).map(mapAlert);
}

export async function createAlert(payload) {
  const data = await api.post("/alerts", payload);
  return mapAlert(data);
}

export async function deleteAlert(id) {
  await api.delete(`/alerts/${id}`);
}

/**
 * Milestones
 */
export async function fetchMilestones(householdId = null) {
  const endpoint = householdId ? `/milestones?household_id=${householdId}` : "/milestones";
  const data = await api.get(endpoint);
  return (data || []).map(mapMilestone);
}

export async function acknowledgeMilestone(id) {
  const data = await api.post(`/milestones/${id}/acknowledge`, {});
  return mapMilestone(data);
}

/**
 * Tax summary
 */
export async function fetchTaxSummary(householdId = null) {
  const endpoint = householdId ? `/tax-summary?household_id=${householdId}` : "/tax-summary";
  const data = await api.get(endpoint);
  return mapTaxSummary(data);
}

/**
 * Benchmark comparison
 */
export async function fetchBenchmark(symbol = "SPY", householdId = null) {
  const params = new URLSearchParams({ symbol });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/benchmark?${params.toString()}`);
  return mapBenchmark(data);
}

/**
 * CSV import
 */
export async function fetchImportBrokers() {
  return (await api.get("/import/brokers")) || [];
}

export async function importParse(broker, csvText) {
  return api.post("/import/parse", { broker, csv_text: csvText });
}

export async function importConfirm(rows, householdId = null) {
  return api.post("/import/confirm", { rows, household_id: householdId });
}

export { api } from "./client";
export { ApiError } from "./client";
