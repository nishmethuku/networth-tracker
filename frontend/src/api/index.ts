/**
 * Main API module - exports all API functions with data mapping
 */

import api, { uploadWithColdStartRetry, AI_TIMEOUT, BULK_IMPORT_TIMEOUT, ApiError } from "./client";
import { supabase } from "../lib/supabaseClient";
import { isDemoMode, DEMO_READ_ONLY_MESSAGE } from "../lib/demoMode";
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
  mapGoal,
  mapLiability,
  mapMilestone,
  mapEmergencyFund,
  mapHousehold,
  mapHouseholdMember,
  mapInvite,
  mapAccount,
} from "./mappers";

/**
 * Holdings
 */
export interface HoldingFilters {
  assetType?: string;
  country?: string;
  householdId?: string;
  currency?: string;
  summary?: boolean;
}

export async function fetchHoldings(filters: HoldingFilters = {}) {
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

export async function fetchHolding(id: number | string, currency: string = "USD") {
  const data = await api.get(`/holdings/${id}?currency=${currency}`);
  return mapHolding(data);
}

export async function createHolding(payload: any) {
  const data = await api.post("/holdings", payload);
  return mapHolding(data);
}

export async function updateHolding(id: number | string, payload: any) {
  const data = await api.put(`/holdings/${id}`, payload);
  return mapHolding(data);
}

export async function deleteHolding(id: number | string) {
  await api.delete(`/holdings/${id}`);
}

/**
 * Transactions (buy/sell ledger for stock/mutual_fund/crypto/commodity)
 */
export async function fetchHoldingTransactions(holdingId: number | string) {
  const data = await api.get(`/holdings/${holdingId}/transactions`);
  return (data || []).map(mapTransaction);
}

export async function createTransaction(holdingId: number | string, payload: any) {
  const data = await api.post(`/holdings/${holdingId}/transactions`, payload);
  return mapTransaction(data);
}

export async function updateTransaction(id: number | string, payload: any) {
  const data = await api.put(`/transactions/${id}`, payload);
  return mapTransaction(data);
}

export async function deleteTransaction(id: number | string) {
  await api.delete(`/transactions/${id}`);
}

export interface TransactionFilters {
  assetType?: string;
  country?: string;
  householdId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface PaginatedTransactions {
  items: ReturnType<typeof mapTransaction>[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Omitting page/perPage returns every matching transaction as a plain
 * array (unchanged legacy shape) -- passing either turns on the backend's
 * existing opt-in pagination (?page=&per_page=), returning
 * {items, total, page, per_page, total_pages} instead. Two different
 * return shapes from one function is a bit unusual, but it mirrors the
 * backend route's own "opt-in by presence of ?page=" design exactly
 * rather than inventing a second function that duplicates all the other
 * filter handling.
 */
export async function fetchAllTransactions(
  filters: TransactionFilters = {},
): Promise<ReturnType<typeof mapTransaction>[] | PaginatedTransactions> {
  const params = new URLSearchParams();
  if (filters.assetType) params.append("asset_type", filters.assetType);
  if (filters.country) params.append("country", filters.country);
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  if (filters.search) params.append("search", filters.search);
  if (filters.page) {
    params.append("page", String(filters.page));
    params.append("per_page", String(filters.perPage || 50));
  }
  const endpoint = params.toString() ? `/transactions?${params.toString()}` : "/transactions";
  const data = await api.get(endpoint);
  if (filters.page) {
    return {
      items: (data?.items || []).map(mapTransaction),
      total: data?.total ?? 0,
      page: data?.page ?? filters.page,
      perPage: data?.per_page ?? filters.perPage ?? 50,
      totalPages: data?.total_pages ?? 0,
    };
  }
  return (data || []).map(mapTransaction);
}

/**
 * Valuations (periodic value/balance entries for real_estate/fixed_deposit/ppf/epf/cash/loan)
 */
export async function fetchHoldingValuations(holdingId: number | string) {
  const data = await api.get(`/holdings/${holdingId}/valuations`);
  return (data || []).map(mapValuation);
}

export async function createValuation(holdingId: number | string, payload: any) {
  const data = await api.post(`/holdings/${holdingId}/valuations`, payload);
  return mapValuation(data);
}

export async function deleteValuation(id: number | string) {
  await api.delete(`/valuations/${id}`);
}

/**
 * Price history / lookup
 */
export async function fetchHoldingPriceHistory(holdingId: number | string) {
  const data = await api.get(`/holdings/${holdingId}/price-history`);
  return mapPriceHistory(data);
}

export interface PriceLookupArgs {
  assetType: string;
  symbol: string;
  date?: string;
  currency?: string;
}

export async function priceLookup({ assetType, symbol, date, currency = "USD" }: PriceLookupArgs): Promise<number | null> {
  const params = new URLSearchParams({ asset_type: assetType, symbol, currency });
  if (date) params.append("date", date);
  const data = await api.get(`/price-lookup?${params.toString()}`);
  return data?.price ?? null;
}

/**
 * Dashboard / net worth history / exchange rates
 */
export interface DashboardFilters {
  householdId?: string;
  currency?: string;
}

export async function fetchDashboard(filters: DashboardFilters = {}) {
  const params = new URLSearchParams();
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.currency) params.append("currency", filters.currency);
  const endpoint = params.toString() ? `/dashboard?${params.toString()}` : "/dashboard";
  const data = await api.get(endpoint);
  return mapDashboard(data);
}

export async function fetchNetWorthHistory(householdId: string | null = null, currency: string = "USD") {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/net-worth-history?${params.toString()}`);
  return mapNetWorthHistory(data);
}

export interface RebuildHistoryResult {
  status: "has_liabilities" | "nothing_recorded" | "up_to_date" | "preview" | "saved";
  first_activity?: string;
  months?: { date: string; total: number }[];
  skipped?: { date: string; reasons: string[] }[];
  more_to_do?: boolean;
}

/** Fill in past months of the net worth chart. apply=false only previews. */
export async function rebuildNetWorthHistory(apply: boolean): Promise<RebuildHistoryResult> {
  // Pricing past months can take a while on the first run (prices are cached after).
  return api.post("/net-worth-history/rebuild", { apply }, BULK_IMPORT_TIMEOUT);
}

export interface MonthlyFlowArgs {
  householdId?: string;
  currency?: string;
  months?: number;
}

export async function fetchMonthlyFlow({ householdId, currency = "USD", months = 12 }: MonthlyFlowArgs = {}) {
  const params = new URLSearchParams({ currency, months: String(months) });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/monthly-flow?${params.toString()}`);
  return mapMonthlyFlow(data);
}

/** Newest stored market price date, used to tell people how current their numbers are. */
export async function fetchPriceCacheStatus(): Promise<{ newestPriceDate: string | null }> {
  const d = await api.get("/price-cache-status");
  return { newestPriceDate: d?.price_history?.newest_price_date ?? null };
}

export async function fetchExchangeRates(base: string = "USD") {
  return api.get(`/exchange-rates?base=${base}`);
}

export interface EmergencyFundArgs {
  householdId?: string;
  currency?: string;
  months?: number;
}

export async function fetchEmergencyFund({ householdId, currency = "USD", months = 6 }: EmergencyFundArgs = {}) {
  const params = new URLSearchParams({ currency, months: String(months) });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/emergency-fund?${params.toString()}`);
  return mapEmergencyFund(data);
}

/**
 * Symbol search (autocomplete)
 */
export async function searchSymbols(query: string, country: string = "", assetType: string = ""): Promise<any[]> {
  if (!query || query.trim().length < 1) return [];
  const params = new URLSearchParams({ q: query.trim() });
  if (country) params.append("country", country);
  if (assetType) params.append("asset_type", assetType);
  const data = await api.get(`/search-symbols?${params.toString()}`);
  return data || [];
}

export async function searchCrypto(query: string): Promise<any[]> {
  if (!query || query.trim().length < 1) return [];
  const data = await api.get(`/search-crypto?q=${encodeURIComponent(query.trim())}`);
  return data || [];
}

/**
 * Price alerts
 */
export async function fetchAlerts() {
  const data = await api.get("/alerts");
  return (data || []).map(mapAlert);
}

export async function createAlert(payload: any) {
  const data = await api.post("/alerts", payload);
  return mapAlert(data);
}

export async function deleteAlert(id: number | string) {
  await api.delete(`/alerts/${id}`);
}

/**
 * Web Push (browser notifications for triggered alerts)
 */
export async function fetchPushVapidPublicKey(): Promise<{ configured: boolean; public_key: string | null }> {
  return api.get("/push/vapid-public-key");
}

export async function subscribeToPush(subscription: PushSubscriptionJSON) {
  return api.post("/push/subscribe", subscription);
}

export async function unsubscribeFromPush(endpoint: string) {
  return api.delete("/push/subscribe", { endpoint });
}

export async function sendTestPush(endpoint: string) {
  return api.post("/push/test", { endpoint });
}

/**
 * Tax summary
 */
export async function fetchTaxSummary(householdId: string | null = null, costBasisMethod: string = "average") {
  const params = new URLSearchParams({ cost_basis_method: costBasisMethod });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/tax-summary?${params.toString()}`);
  return mapTaxSummary(data);
}

export interface IncomeSummary {
  total: number;
  last12Months: number;
  yieldPct: number | null;
  byYear: { year: number; amount: number }[];
  byMonth: { month: string; amount: number }[];
  byHolding: { holdingId: number; name: string; symbol: string | null; total: number; last12Months: number }[];
  count: number;
}

/** Dividend and interest income, grouped by year, month and holding. */
export async function fetchIncomeSummary(currency: string = "USD", householdId: string | null = null): Promise<IncomeSummary> {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  const d = await api.get(`/income-summary?${params.toString()}`);
  return {
    total: d?.total ?? 0,
    last12Months: d?.last_12_months ?? 0,
    yieldPct: d?.yield_pct ?? null,
    byYear: d?.by_year ?? [],
    byMonth: d?.by_month ?? [],
    byHolding: (d?.by_holding ?? []).map((r: any) => ({
      holdingId: r.holding_id,
      name: r.name,
      symbol: r.symbol ?? null,
      total: r.total,
      last12Months: r.last_12_months,
    })),
    count: d?.count ?? 0,
  };
}

/**
 * Benchmark comparison
 */
export async function fetchBenchmark(symbol: string = "SPY", householdId: string | null = null) {
  const params = new URLSearchParams({ symbol });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/benchmark?${params.toString()}`);
  return mapBenchmark(data);
}

/**
 * CSV import
 */
export async function fetchImportBrokers(): Promise<string[]> {
  return (await api.get("/import/brokers")) || [];
}

export async function importParse(broker: string, csvText: string) {
  return api.post("/import/parse", { broker, csv_text: csvText });
}

export async function importConfirm(rows: any[], householdId: string | null = null) {
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
export async function smartImportParse(file: File, householdId: string | null = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (householdId) formData.append("household_id", householdId);
  return uploadWithColdStartRetry("/import/smart-parse", formData);
}

export async function smartImportConfirm(rows: any[], householdId: string | null = null) {
  return api.post("/import/smart-confirm", { rows, household_id: householdId }, BULK_IMPORT_TIMEOUT);
}

/**
 * Deterministic (no AI) CSV import for the one agreed transaction-log
 * format -- confirms through smartImportConfirm above, since the row
 * shape matches exactly.
 */
export async function simpleCsvParse(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return uploadWithColdStartRetry("/import/simple-csv-parse", formData);
}

/**
 * AI features (copilot chat, allocation advisor, transaction categorizer, NL search).
 * All require owner/editor household role server-side and return a clean
 * 503/{configured:false} shape until GEMINI_API_KEY is set — never a crash.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamAiChatArgs {
  messages: ChatMessage[];
  householdId?: string | null;
  currency?: string;
}

/**
 * Streams the copilot chat response as an async generator of text chunks.
 * Bypasses api/client.js's 10s timeout (unsuitable for a streaming response)
 * and parses the backend's SSE-formatted `data: {...}\n\n` frames by hand.
 */
export async function* streamAiChat({ messages, householdId, currency = "USD" }: StreamAiChatArgs, signal?: AbortSignal) {
  if (isDemoMode()) throw new ApiError("The AI assistant is turned off in the demo. Sign up to try it on your own data.", 403);
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
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = {};
    }
    const err: any = new Error(errorData.error || `HTTP ${response.status}`);
    err.status = response.status;
    err.code = errorData.code;
    throw err;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
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

export interface AllocationAdviceArgs {
  targetAllocation: Record<string, number>;
  householdId?: string | null;
  currency?: string;
}

export async function fetchAllocationAdvice({ targetAllocation, householdId, currency = "USD" }: AllocationAdviceArgs) {
  return api.post(
    "/api/ai/allocation-advisor",
    {
      target_allocation: targetAllocation,
      household_id: householdId,
      currency,
    },
    AI_TIMEOUT,
  );
}

export async function suggestTransactionTags(transactionId: number | string) {
  return api.post(`/transactions/${transactionId}/suggest-tags`, {}, AI_TIMEOUT);
}

/**
 * Saved allocation target + drift check (AI-free, cheap — distinct from
 * fetchAllocationAdvice, which calls Gemini for a narrative).
 */
export async function fetchAllocationTargets() {
  return api.get("/allocation-targets");
}

export async function saveAllocationTargets(targetAllocation: Record<string, number>) {
  return api.put("/allocation-targets", { target_allocation: targetAllocation });
}

export async function clearAllocationTargets() {
  return api.delete("/allocation-targets");
}

export async function fetchAllocationDrift(currency: string = "USD") {
  return api.get(`/allocation-drift?currency=${currency}`);
}

export async function aiSearch(query: string, householdId: string | null = null) {
  return api.post("/api/ai/search", { query, household_id: householdId }, AI_TIMEOUT);
}

export interface BudgetInsightsArgs {
  householdId?: string;
  months?: number;
  currency?: string;
}

export async function fetchBudgetInsights({ householdId, months = 6, currency = "USD" }: BudgetInsightsArgs = {}) {
  return api.post("/api/ai/budget-insights", { household_id: householdId, months, currency }, AI_TIMEOUT);
}

/**
 * Net worth goals
 */
export async function fetchGoals() {
  const data = await api.get("/goals");
  return (data || []).map(mapGoal);
}

export async function createGoal(payload: any) {
  const data = await api.post("/goals", payload);
  return mapGoal(data);
}

export async function updateGoal(id: number | string, payload: any) {
  const data = await api.put(`/goals/${id}`, payload);
  return mapGoal(data);
}

export async function deleteGoal(id: number | string) {
  await api.delete(`/goals/${id}`);
}

/**
 * Liabilities (debt)
 */
export interface LiabilityFilters {
  householdId?: string;
  currency?: string;
}

export async function fetchLiabilities({ householdId, currency = "USD" }: LiabilityFilters = {}) {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  const data = await api.get(`/liabilities?${params.toString()}`);
  return (data || []).map(mapLiability);
}

export async function createLiability(payload: any) {
  const data = await api.post("/liabilities", payload);
  return mapLiability(data);
}

export async function updateLiability(id: number | string, payload: any) {
  const data = await api.put(`/liabilities/${id}`, payload);
  return mapLiability(data);
}

export async function recordLiabilityPayment(
  id: number | string,
  payload: { amount: number; payment_date: string; currency: string; funding_source_holding_id?: number },
) {
  const data = await api.post(`/liabilities/${id}/payments`, payload);
  return {
    liability: mapLiability(data.liability),
    fundingSource: data.funding_source
      ? { holdingId: data.funding_source.holding_id, newBalance: Number(data.funding_source.value), currency: data.funding_source.currency }
      : null,
  };
}

export async function deleteLiability(id: number | string) {
  await api.delete(`/liabilities/${id}`);
}

/**
 * Net worth milestones (auto-detected, from the daily snapshot job)
 */
export async function fetchMilestones({ householdId }: { householdId?: string } = {}) {
  const endpoint = householdId ? `/milestones?household_id=${householdId}` : "/milestones";
  const data = await api.get(endpoint);
  return (data || []).map(mapMilestone);
}

export async function acknowledgeMilestone(id: number | string) {
  const data = await api.put(`/milestones/${id}/acknowledge`, {});
  return mapMilestone(data);
}

/**
 * Account data (Settings page).
 */
export async function fetchAccountExport() {
  return api.get("/account/export");
}

/**
 * Same data as fetchAccountExport, as a zip of CSVs — bypasses the JSON-only
 * request() helper since this needs to return a Blob, not parsed JSON.
 */
export async function fetchAccountExportCsvZip(): Promise<Blob> {
  if (isDemoMode()) throw new ApiError(DEMO_READ_ONLY_MESSAGE, 403);
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const response = await fetch(`${API_BASE_URL}/account/export.zip`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    throw new ApiError(`HTTP ${response.status}`, response.status);
  }
  return response.blob();
}

/**
 * Restores from a fetchAccountExport()-shaped JSON backup. Additive --
 * see the backend route's own docstring for why (never overwrites/
 * replaces existing data, and never trusts the file's own user_id/
 * household_id).
 */
export async function restoreAccountData(data: Record<string, unknown>) {
  return api.post("/account/restore", data, BULK_IMPORT_TIMEOUT);
}

export async function deleteAllAccountData() {
  return api.delete("/account/data", { confirm: "DELETE" });
}

export async function fetchDigestSubscription(): Promise<{ subscribed: boolean }> {
  return api.get("/account/digest-subscription");
}

export async function setDigestSubscription(subscribed: boolean): Promise<{ subscribed: boolean }> {
  return api.put("/account/digest-subscription", { subscribed });
}

/**
 * SIP (recurring investment) projection.
 */
export async function fetchSipProjection(holdingId: number | string, years: number = 10) {
  return api.get(`/holdings/${holdingId}/sip-projection?years=${years}`);
}

/**
 * Budget (income/expenses) — independent of holdings/net worth.
 */
export async function fetchBudgetCategories({ householdId }: { householdId?: string } = {}) {
  const params = new URLSearchParams();
  if (householdId) params.append("household_id", householdId);
  const endpoint = params.toString() ? `/budget/categories?${params.toString()}` : "/budget/categories";
  return api.get(endpoint);
}

export async function createBudgetCategory(payload: { entry_type: string; name: string; household_id?: string | null }) {
  return api.post("/budget/categories", payload);
}

export async function deleteBudgetCategory(id: number | string) {
  await api.delete(`/budget/categories/${id}`);
}

export interface BudgetEntryFilters {
  householdId?: string;
  entryType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchBudgetEntries(filters: BudgetEntryFilters = {}) {
  const params = new URLSearchParams();
  if (filters.householdId) params.append("household_id", filters.householdId);
  if (filters.entryType) params.append("entry_type", filters.entryType);
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  const endpoint = params.toString() ? `/budget/entries?${params.toString()}` : "/budget/entries";
  const data = await api.get(endpoint);
  return (data || []).map(mapBudgetEntry);
}

export async function createBudgetEntry(payload: any) {
  const data = await api.post("/budget/entries", payload);
  return mapBudgetEntry(data);
}

export async function updateBudgetEntry(id: number | string, payload: any) {
  const data = await api.put(`/budget/entries/${id}`, payload);
  return mapBudgetEntry(data);
}

/** With `reverse`, the money the expense moved (card balance, cash account, loan payment) is put back. */
export async function deleteBudgetEntry(id: number | string, opts: { reverse?: boolean } = {}) {
  return api.delete(`/budget/entries/${id}${opts.reverse ? "?reverse=true" : ""}`);
}

export interface BudgetSummaryArgs {
  householdId?: string;
  months?: number;
  currency?: string;
}

export async function fetchBudgetSummary({ householdId, months = 6, currency = "USD" }: BudgetSummaryArgs = {}) {
  const params = new URLSearchParams({ months: String(months), currency });
  if (householdId) params.append("household_id", householdId);
  return api.get(`/budget/summary?${params.toString()}`);
}

export async function fetchSubscriptions({ householdId, currency = "USD" }: { householdId?: string; currency?: string } = {}) {
  const params = new URLSearchParams({ currency });
  if (householdId) params.append("household_id", householdId);
  return api.get(`/budget/subscriptions?${params.toString()}`);
}

export async function fetchBudgetLimits({ householdId }: { householdId?: string } = {}) {
  const params = new URLSearchParams();
  if (householdId) params.append("household_id", householdId);
  const endpoint = params.toString() ? `/budget/limits?${params.toString()}` : "/budget/limits";
  const data = await api.get(endpoint);
  return (data || []).map(mapBudgetLimit);
}

export async function createBudgetLimit(payload: any) {
  const data = await api.post("/budget/limits", payload);
  return mapBudgetLimit(data);
}

/**
 * Account registry -- the account names holdings get grouped under.
 */
export async function fetchAccounts({ householdId }: { householdId?: string } = {}) {
  const params = new URLSearchParams();
  if (householdId) params.append("household_id", householdId);
  const endpoint = params.toString() ? `/accounts?${params.toString()}` : "/accounts";
  const data = await api.get(endpoint);
  return (data || []).map(mapAccount);
}

export async function createAccount(payload: { name: string; household_id?: string | null }) {
  const data = await api.post("/accounts", payload);
  return mapAccount(data);
}

export async function deleteAccount(id: number | string) {
  await api.delete(`/accounts/${id}`);
}

export async function deleteAccountAndHoldings(name: string, householdId?: string | null) {
  return api.post("/accounts/delete-with-holdings", { name, household_id: householdId ?? null });
}

export async function renameAccount(oldName: string, newName: string, householdId?: string | null) {
  return api.post("/accounts/rename", { old_name: oldName, new_name: newName, household_id: householdId ?? null });
}

export async function deleteBudgetLimit(id: number | string) {
  await api.delete(`/budget/limits/${id}`);
}

/**
 * AI-assisted bank/credit card statement import (CSV, Excel, or PDF) into
 * Budget entries — same multipart-upload pattern as smartImportParse above.
 */
export async function bankStatementParse(file: File, householdId: string | null = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (householdId) formData.append("household_id", householdId);
  return uploadWithColdStartRetry("/import/bank-statement-parse", formData);
}

export async function bankStatementConfirm(rows: any[], householdId: string | null = null, currency: string = "USD") {
  return api.post("/import/bank-statement-confirm", { rows, household_id: householdId, currency });
}

/**
 * Household sharing: create/list households you belong to, invite by
 * email with a role, accept an invite sent to you, view members, and
 * leave/remove/delete. See README's Household sharing feature entry --
 * this is the management surface for it (the household_id query param
 * accepted throughout the rest of this file is the *viewing* half,
 * already wired everywhere; this is what actually lets a user obtain a
 * household_id to pass in in the first place).
 */
export async function fetchHouseholds() {
  const data = await api.get("/households");
  return (data || []).map(mapHousehold);
}

export async function createHousehold(name: string) {
  const data = await api.post("/households", { name });
  return mapHousehold(data);
}

export async function fetchHouseholdMembers(householdId: string) {
  const data = await api.get(`/households/${householdId}/members`);
  return (data || []).map(mapHouseholdMember);
}

export async function inviteToHousehold(householdId: string, email: string, role: string) {
  const data = await api.post(`/households/${householdId}/invites`, { email, role });
  return mapInvite(data);
}

export async function fetchMyInvites() {
  const data = await api.get("/invites");
  return (data || []).map(mapInvite);
}

export async function acceptInvite(inviteId: string) {
  const data = await api.post(`/invites/${inviteId}/accept`, {});
  return mapInvite(data);
}

export async function leaveHousehold(householdId: string) {
  await api.post(`/households/${householdId}/leave`, {});
}

export async function removeHouseholdMember(householdId: string, userId: string) {
  await api.delete(`/households/${householdId}/members/${userId}`);
}

export async function deleteHousehold(householdId: string) {
  await api.delete(`/households/${householdId}`, { confirm: "DELETE" });
}

export { api } from "./client";
export { ApiError } from "./client";
