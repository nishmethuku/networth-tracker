/**
 * Main API module - exports all API functions with data mapping
 */

import api, { uploadWithColdStartRetry, AI_TIMEOUT } from "./client";
import { supabase } from "../lib/supabaseClient";
import {
  mapHolding,
  mapTransaction,
  mapValuation,
  mapDashboard,
  mapNetWorthHistory,
  mapPriceHistory,
  mapAlert,
  mapTaxSummary,
  mapBenchmark,
  mapBudgetEntry,
  mapBudgetLimit,
  mapMonthlyFlow,
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
  if (filters.summary) params.append("summary", "true");
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

export async function fetchNetWorthHistory(householdId = null, currency = "USD") {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/net-worth-history?${params.toString()}`);
  return mapNetWorthHistory(data);
}

export async function fetchMonthlyFlow({ householdId, currency = "USD", months = 12 } = {}) {
  const params = new URLSearchParams({ currency, months: String(months) });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/monthly-flow?${params.toString()}`);
  return mapMonthlyFlow(data);
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

export async function deleteHousehold(householdId) {
  return api.delete(`/households/${householdId}`, { confirm: "DELETE" });
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

/**
 * AI-assisted import of a freeform spreadsheet (owner/editor only). The
 * parse step is a real file upload (multipart), so it goes through
 * uploadWithColdStartRetry instead of api.post — JSON.stringify-ing a
 * File doesn't work, and this needs the same cold-start retry treatment
 * as any other request (a file upload is just as likely to be the first
 * thing a user does in a session as a GET is).
 */
export async function smartImportParse(file, householdId = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (householdId) formData.append("household_id", householdId);
  return uploadWithColdStartRetry("/import/smart-parse", formData);
}

export async function smartImportConfirm(rows, householdId = null) {
  return api.post("/import/smart-confirm", { rows, household_id: householdId });
}

/**
 * AI features (copilot chat, allocation advisor, transaction categorizer, NL search).
 * All require owner/editor household role server-side and return a clean
 * 503/{configured:false} shape until GEMINI_API_KEY is set — never a crash.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

/**
 * Streams the copilot chat response as an async generator of text chunks.
 * Bypasses api/client.js's 10s timeout (unsuitable for a streaming response)
 * and parses the backend's SSE-formatted `data: {...}\n\n` frames by hand.
 */
export async function* streamAiChat({ messages, householdId, currency = "USD" }, signal) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ messages, household_id: householdId, currency }),
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = {};
    }
    const err = new Error(errorData.error || `HTTP ${response.status}`);
    err.status = response.status;
    err.code = errorData.code;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop();
    for (const frame of frames) {
      if (!frame.startsWith("data: ")) continue;
      const payload = frame.slice(6);
      if (payload === "[DONE]") return;
      const parsed = JSON.parse(payload);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.text) yield parsed.text;
    }
  }
}

export async function fetchAllocationAdvice({ targetAllocation, householdId, currency = "USD" }) {
  return api.post(
    "/api/ai/allocation-advisor",
    {
      target_allocation: targetAllocation,
      household_id: householdId,
      currency,
    },
    AI_TIMEOUT
  );
}

export async function suggestTransactionTags(transactionId) {
  return api.post(`/transactions/${transactionId}/suggest-tags`, {}, AI_TIMEOUT);
}

export async function aiSearch(query, householdId = null) {
  return api.post("/api/ai/search", { query, household_id: householdId }, AI_TIMEOUT);
}

export async function fetchBudgetInsights({ householdId, months = 6, currency = "USD" } = {}) {
  return api.post("/api/ai/budget-insights", { household_id: householdId, months, currency }, AI_TIMEOUT);
}

/**
 * Account data (Settings page).
 */
export async function fetchAccountExport() {
  return api.get("/account/export");
}

export async function deleteAllAccountData() {
  return api.delete("/account/data", { confirm: "DELETE" });
}

/**
 * SIP (recurring investment) projection.
 */
export async function fetchSipProjection(holdingId, years = 10) {
  return api.get(`/holdings/${holdingId}/sip-projection?years=${years}`);
}

/**
 * Budget (income/expenses) — independent of holdings/net worth.
 */
export async function fetchBudgetCategories() {
  return api.get("/budget/categories");
}

export async function fetchBudgetEntries(filters = {}) {
  const params = new URLSearchParams();
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.entryType) params.append("entry_type", filters.entryType);
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  const endpoint = params.toString() ? `/budget/entries?${params.toString()}` : "/budget/entries";
  const data = await api.get(endpoint);
  return (data || []).map(mapBudgetEntry);
}

export async function createBudgetEntry(payload) {
  const data = await api.post("/budget/entries", payload);
  return mapBudgetEntry(data);
}

export async function updateBudgetEntry(id, payload) {
  const data = await api.put(`/budget/entries/${id}`, payload);
  return mapBudgetEntry(data);
}

export async function deleteBudgetEntry(id) {
  await api.delete(`/budget/entries/${id}`);
}

export async function fetchBudgetSummary({ householdId, months = 6, currency = "USD" } = {}) {
  const params = new URLSearchParams({ months: String(months), currency });
  if (householdId) params.append("household_id", householdId);
  return api.get(`/budget/summary?${params.toString()}`);
}

export async function fetchSubscriptions({ householdId, currency = "USD" } = {}) {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  return api.get(`/budget/subscriptions?${params.toString()}`);
}

export async function fetchBudgetLimits({ householdId } = {}) {
  const params = new URLSearchParams();
  if (householdId) params.append("household_id", householdId);
  const endpoint = params.toString() ? `/budget/limits?${params.toString()}` : "/budget/limits";
  const data = await api.get(endpoint);
  return (data || []).map(mapBudgetLimit);
}

export async function createBudgetLimit(payload) {
  const data = await api.post("/budget/limits", payload);
  return mapBudgetLimit(data);
}

export async function deleteBudgetLimit(id) {
  await api.delete(`/budget/limits/${id}`);
}

/**
 * AI-assisted bank/credit card statement import (CSV, Excel, or PDF) into
 * Budget entries — same multipart-upload pattern as smartImportParse above.
 */
export async function bankStatementParse(file, householdId = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (householdId) formData.append("household_id", householdId);
  return uploadWithColdStartRetry("/import/bank-statement-parse", formData);
}

export async function bankStatementConfirm(rows, householdId = null, currency = "USD") {
  return api.post("/import/bank-statement-confirm", { rows, household_id: householdId, currency });
}

export { api } from "./client";
export { ApiError } from "./client";
