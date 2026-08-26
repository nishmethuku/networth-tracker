/**
 * Data mapping layer: normalize backend responses into frontend-friendly
 * objects. Inputs are typed `any` (raw JSON off the wire, shape owned by
 * the Flask backend, not yet formally shared with the frontend) — the
 * value here is in the *output* types, so every consumer of e.g.
 * mapHolding() gets real autocomplete and a compile error on a typo'd
 * field name, rather than a silent `undefined` at runtime.
 */
import { safeNumber } from "../utils/formatters";

export interface Holding {
  id: number;
  userId: string;
  householdId: string | null;
  assetType: string;
  symbol: string | null;
  name: string;
  country: string;
  account: string;
  institution: string | null;
  currency: string;
  interestRate: number | null;
  maturityDate: string | null;
  sipAmount: number | null;
  sipFrequency: string | null;
  sipStartDate: string | null;
  isPrivate: boolean;
  notes: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;

  // Quantity-based metrics (stock/mutual_fund/crypto/commodity)
  quantity: number | null;
  avgCost: number | null;
  costBasis: number | null;
  displayCostBasis: number | null;
  currentPrice: number | null;
  realizedGain: number | null;
  unrealizedGain: number | null;
  totalGain: number | null;
  xirr: number | null;
  incomeReceived: number | null;
  displayIncomeReceived: number | null;

  // Valuation-based metrics (real_estate/fixed_deposit/ppf/epf/cash/loan)
  firstValue: number | null;
  displayFirstValue: number | null;
  gain: number | null;
  history: unknown;

  // Common
  currentValue: number;
  displayValue: number;
  displayName: string;
}

export function mapHolding(h: any): Holding | null {
  if (!h) return null;
  return {
    id: h.id,
    userId: h.user_id,
    householdId: h.household_id,
    assetType: h.asset_type,
    symbol: h.symbol ?? null,
    name: h.name ?? "",
    country: h.country ?? "",
    account: h.account ?? "",
    institution: h.institution ?? null,
    currency: h.currency ?? "USD",
    interestRate: h.interest_rate ?? null,
    maturityDate: h.maturity_date ?? null,
    sipAmount: h.sip_amount ?? null,
    sipFrequency: h.sip_frequency ?? null,
    sipStartDate: h.sip_start_date ?? null,
    isPrivate: !!h.is_private,
    notes: h.notes ?? "",
    tags: h.tags
      ? h.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean)
      : [],
    status: h.status ?? "active",
    createdAt: h.created_at ?? "",
    updatedAt: h.updated_at ?? "",

    quantity: h.quantity != null ? safeNumber(h.quantity) : null,
    avgCost: h.avg_cost != null ? safeNumber(h.avg_cost) : null,
    costBasis: h.cost_basis != null ? safeNumber(h.cost_basis) : null,
    displayCostBasis: h.display_cost_basis != null ? safeNumber(h.display_cost_basis) : null,
    currentPrice: h.current_price != null ? safeNumber(h.current_price) : null,
    realizedGain: h.realized_gain != null ? safeNumber(h.realized_gain) : null,
    unrealizedGain: h.unrealized_gain != null ? safeNumber(h.unrealized_gain) : null,
    totalGain: h.total_gain != null ? safeNumber(h.total_gain) : null,
    xirr: h.xirr != null ? safeNumber(h.xirr) : null,
    incomeReceived: h.income_received != null ? safeNumber(h.income_received) : null,
    displayIncomeReceived: h.display_income_received != null ? safeNumber(h.display_income_received) : null,

    firstValue: h.first_value != null ? safeNumber(h.first_value) : null,
    displayFirstValue: h.display_first_value != null ? safeNumber(h.display_first_value) : null,
    gain: h.gain != null ? safeNumber(h.gain) : null,
    history: h.history || null,

    currentValue: safeNumber(h.current_value),
    displayValue: safeNumber(h.display_value ?? h.current_value),

    displayName: h.symbol || h.name || `Holding #${h.id}`,
  };
}

export interface FundingSource {
  holdingId: number;
  newBalance: number;
  currency: string;
}

export interface LinkedLiabilityPayment {
  liabilityId: number;
  newBalance: number;
  currency: string;
}

export interface Transaction {
  id: number;
  holdingId: number;
  holdingName: string | null;
  holdingSymbol: string | null;
  assetType: string | null;
  country: string | null;
  transactionType: string;
  transactionDate: string;
  quantity: number;
  pricePerUnit: number;
  currency: string;
  fees: number;
  notes: string;
  tags: string[];
  createdAt: string;
  fundingSource: FundingSource | null;
}

export function mapTransaction(t: any): Transaction | null {
  if (!t) return null;
  return {
    id: t.id,
    holdingId: t.holding_id,
    holdingName: t.holding_name ?? null,
    holdingSymbol: t.holding_symbol ?? null,
    assetType: t.asset_type ?? null,
    country: t.country ?? null,
    transactionType: t.transaction_type,
    transactionDate: t.transaction_date,
    quantity: safeNumber(t.quantity),
    pricePerUnit: safeNumber(t.price_per_unit),
    currency: t.currency ?? "USD",
    fees: safeNumber(t.fees),
    notes: t.notes ?? "",
    tags: t.tags ?? [],
    createdAt: t.created_at ?? "",
    fundingSource: t.funding_source
      ? { holdingId: t.funding_source.holding_id, newBalance: safeNumber(t.funding_source.value), currency: t.funding_source.currency }
      : null,
  };
}

export interface Valuation {
  id: number;
  holdingId: number;
  valuationDate: string;
  value: number;
  currency: string;
  notes: string;
  createdAt: string;
}

export function mapValuation(v: any): Valuation | null {
  if (!v) return null;
  return {
    id: v.id,
    holdingId: v.holding_id,
    valuationDate: v.valuation_date,
    value: safeNumber(v.value),
    currency: v.currency ?? "USD",
    notes: v.notes ?? "",
    createdAt: v.created_at ?? "",
  };
}

export interface AllocationSlice {
  label: string;
  value: number;
}

export interface Mover {
  id: number;
  name: string;
  symbol: string | null;
  assetType: string;
  changePct: number;
  currentValue: number;
}

export interface Dashboard {
  totalNetWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currency: string;
  portfolioXirr: number | null;
  allocationByType: AllocationSlice[];
  allocationByCountry: AllocationSlice[];
  allocationByCurrency: AllocationSlice[];
  topGainers: (Mover | null)[];
  topLosers: (Mover | null)[];
  realizedGain: number;
  unrealizedGain: number;
  incomeReceived: number;
}

export function mapDashboard(d: any): Dashboard | null {
  if (!d) return null;
  return {
    totalNetWorth: safeNumber(d.total_net_worth),
    totalAssets: safeNumber(d.total_assets ?? d.total_net_worth),
    totalLiabilities: safeNumber(d.total_liabilities),
    currency: d.currency ?? "USD",
    portfolioXirr: d.portfolio_xirr != null ? safeNumber(d.portfolio_xirr) : null,
    allocationByType: (d.allocation_by_type || []).map((a: any) => ({
      label: a.label,
      value: safeNumber(a.value),
    })),
    allocationByCountry: (d.allocation_by_country || []).map((a: any) => ({
      label: a.label,
      value: safeNumber(a.value),
    })),
    allocationByCurrency: (d.allocation_by_currency || []).map((a: any) => ({
      label: a.label,
      value: safeNumber(a.value),
    })),
    topGainers: (d.top_gainers || []).map(mapMover),
    topLosers: (d.top_losers || []).map(mapMover),
    realizedGain: safeNumber(d.realized_gain),
    unrealizedGain: safeNumber(d.unrealized_gain),
    incomeReceived: safeNumber(d.income_received),
  };
}

function mapMover(m: any): Mover {
  return {
    id: m.id,
    name: m.name,
    symbol: m.symbol,
    assetType: m.asset_type,
    changePct: safeNumber(m.change_pct),
    currentValue: safeNumber(m.current_value),
  };
}

export interface NetWorthHistoryPoint {
  date: string;
  netWorth: number;
  stockValue: number;
  propertyValue: number;
  profitLoss: number;
  liabilities: number;
  byAssetType: Record<string, number>;
}

export function mapNetWorthHistory(rows: any[]): NetWorthHistoryPoint[] {
  return (rows || []).map((r) => ({
    date: r.snapshot_date,
    netWorth: safeNumber(r.total_net_worth),
    stockValue: safeNumber(r.total_stock_value),
    propertyValue: safeNumber(r.total_property_value),
    profitLoss: safeNumber(r.total_profit_loss),
    liabilities: safeNumber(r.total_liabilities),
    byAssetType: r.by_asset_type || {},
  }));
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
  currency: string;
  source: string;
}

export function mapPriceHistory(rows: any[]): PriceHistoryPoint[] {
  return (rows || []).map((r) => ({
    date: r.price_date,
    price: safeNumber(r.price),
    currency: r.currency,
    source: r.source,
  }));
}

export interface Alert {
  id: number;
  holdingId: number | null;
  symbol: string | null;
  assetType: string | null;
  alertType: string;
  threshold: number;
  currency: string;
  status: string;
  createdAt: string;
  triggeredAt: string | null;
}

export function mapAlert(a: any): Alert | null {
  if (!a) return null;
  return {
    id: a.id,
    holdingId: a.holding_id,
    symbol: a.symbol,
    assetType: a.asset_type,
    alertType: a.alert_type,
    threshold: safeNumber(a.threshold),
    currency: a.currency,
    status: a.status,
    createdAt: a.created_at,
    triggeredAt: a.triggered_at,
  };
}

export interface TaxEstimate {
  shortTermTax: number;
  longTermTax: number;
  totalTax: number;
}

export interface TaxSummaryRow {
  financialYear: string;
  country: string;
  realizedGain: number;
  shortTermGain: number;
  longTermGain: number;
  taxEstimate: TaxEstimate | null;
  byHolding: { name: string; realizedGain: number }[];
}

export interface TaxSummary {
  disclaimer: string | null;
  costBasisMethod: string;
  rows: TaxSummaryRow[];
}

export function mapTaxSummary(response: any): TaxSummary {
  const rows = response?.rows || (Array.isArray(response) ? response : []);
  return {
    disclaimer: response?.disclaimer || null,
    costBasisMethod: response?.cost_basis_method || "average",
    rows: rows.map((r: any) => ({
      financialYear: r.financial_year,
      country: r.country,
      realizedGain: safeNumber(r.realized_gain),
      shortTermGain: safeNumber(r.short_term_gain),
      longTermGain: safeNumber(r.long_term_gain),
      taxEstimate: r.tax_estimate
        ? {
            shortTermTax: safeNumber(r.tax_estimate.short_term_tax),
            longTermTax: safeNumber(r.tax_estimate.long_term_tax),
            totalTax: safeNumber(r.tax_estimate.total_tax),
          }
        : null,
      byHolding: (r.by_holding || []).map((h: any) => ({ name: h.name, realizedGain: safeNumber(h.realized_gain) })),
    })),
  };
}

export interface Benchmark {
  benchmarkSymbol: string;
  benchmarkLabel: string;
  portfolioXirr: number | null;
  benchmarkXirr: number | null;
  buysUsed: number;
  buysSkipped: number;
}

export function mapBenchmark(b: any): Benchmark | null {
  if (!b) return null;
  return {
    benchmarkSymbol: b.benchmark_symbol,
    benchmarkLabel: b.benchmark_label,
    portfolioXirr: b.portfolio_xirr != null ? safeNumber(b.portfolio_xirr) : null,
    benchmarkXirr: b.benchmark_xirr != null ? safeNumber(b.benchmark_xirr) : null,
    buysUsed: b.buys_used,
    buysSkipped: b.buys_skipped_no_price,
  };
}

export interface BudgetEntry {
  id: number;
  householdId: string | null;
  entryType: string;
  entryDate: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  isPrivate: boolean;
  isRecurring: boolean;
  recurringFrequency: string | null;
  createdAt: string;
  fundingSource: FundingSource | null;
  linkedLiabilityId: number | null;
  linkedLiability: LinkedLiabilityPayment | null;
  depositTargetHoldingId: number | null;
  depositTarget: FundingSource | null;
}

export function mapBudgetEntry(e: any): BudgetEntry | null {
  if (!e) return null;
  return {
    id: e.id,
    householdId: e.household_id,
    entryType: e.entry_type,
    entryDate: e.entry_date,
    amount: safeNumber(e.amount),
    currency: e.currency ?? "USD",
    category: e.category,
    description: e.description ?? "",
    isPrivate: !!e.is_private,
    isRecurring: !!e.is_recurring,
    recurringFrequency: e.recurring_frequency ?? null,
    createdAt: e.created_at ?? "",
    fundingSource: e.funding_source
      ? { holdingId: e.funding_source.holding_id, newBalance: safeNumber(e.funding_source.value), currency: e.funding_source.currency }
      : null,
    linkedLiabilityId: e.linked_liability_id ?? null,
    linkedLiability: e.linked_liability
      ? {
          liabilityId: e.linked_liability.id,
          newBalance: safeNumber(e.linked_liability.current_balance),
          currency: e.linked_liability.currency,
        }
      : null,
    depositTargetHoldingId: e.deposit_target_holding_id ?? null,
    depositTarget: e.deposit_target
      ? { holdingId: e.deposit_target.holding_id, newBalance: safeNumber(e.deposit_target.value), currency: e.deposit_target.currency }
      : null,
  };
}

export interface BudgetLimit {
  id: number;
  householdId: string | null;
  category: string;
  monthlyLimit: number;
  currency: string;
  createdAt: string;
}

export function mapBudgetLimit(l: any): BudgetLimit | null {
  if (!l) return null;
  return {
    id: l.id,
    householdId: l.household_id,
    category: l.category,
    monthlyLimit: safeNumber(l.monthly_limit),
    currency: l.currency ?? "USD",
    createdAt: l.created_at ?? "",
  };
}

export interface MonthlyFlowPoint {
  month: string;
  totalFlow: number;
  byAssetType: Record<string, number>;
}

export function mapMonthlyFlow(rows: any[]): MonthlyFlowPoint[] {
  return (rows || []).map((r) => ({
    month: r.month,
    totalFlow: safeNumber(r.total_flow),
    byAssetType: r.by_asset_type || {},
  }));
}

export interface Goal {
  id: number;
  name: string;
  targetAmount: number;
  currency: string;
  targetDate: string | null;
  createdAt: string;
}

export function mapGoal(g: any): Goal | null {
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    targetAmount: safeNumber(g.target_amount),
    currency: g.currency ?? "USD",
    targetDate: g.target_date ?? null,
    createdAt: g.created_at ?? "",
  };
}

export interface EmergencyFund {
  currency: string;
  liquidValue: number;
  avgMonthlyExpenses: number | null;
  monthsCovered: number | null;
  recommendedMonths: number;
}

export function mapEmergencyFund(e: any): EmergencyFund | null {
  if (!e) return null;
  return {
    currency: e.currency ?? "USD",
    liquidValue: safeNumber(e.liquid_value),
    avgMonthlyExpenses: e.avg_monthly_expenses != null ? safeNumber(e.avg_monthly_expenses) : null,
    monthsCovered: e.months_covered != null ? safeNumber(e.months_covered) : null,
    recommendedMonths: safeNumber(e.recommended_months),
  };
}

export interface Milestone {
  id: number;
  householdId: string | null;
  threshold: number;
  currency: string;
  achievedDate: string;
  acknowledged: boolean;
}

export function mapMilestone(m: any): Milestone | null {
  if (!m) return null;
  return {
    id: m.id,
    householdId: m.household_id,
    threshold: safeNumber(m.threshold),
    currency: m.currency ?? "USD",
    achievedDate: m.achieved_date,
    acknowledged: !!m.acknowledged,
  };
}

export interface Liability {
  id: number;
  householdId: string | null;
  name: string;
  liabilityType: string;
  currency: string;
  currentBalance: number;
  displayBalance: number;
  originalAmount: number | null;
  interestRate: number | null;
  notes: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export function mapLiability(l: any): Liability | null {
  if (!l) return null;
  return {
    id: l.id,
    householdId: l.household_id,
    name: l.name,
    liabilityType: l.liability_type,
    currency: l.currency ?? "USD",
    currentBalance: safeNumber(l.current_balance),
    displayBalance: safeNumber(l.display_balance ?? l.current_balance),
    originalAmount: l.original_amount != null ? safeNumber(l.original_amount) : null,
    interestRate: l.interest_rate != null ? safeNumber(l.interest_rate) : null,
    notes: l.notes ?? "",
    isPrivate: !!l.is_private,
    createdAt: l.created_at ?? "",
    updatedAt: l.updated_at ?? "",
  };
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  myRole: string | null;
}

export function mapHousehold(h: any): Household | null {
  if (!h) return null;
  return {
    id: h.id,
    name: h.name,
    ownerId: h.owner_id,
    createdAt: h.created_at ?? "",
    myRole: h.my_role ?? null,
  };
}

export interface HouseholdMember {
  householdId: string;
  userId: string;
  role: string;
  joinedAt: string | null;
  email: string;
}

export function mapHouseholdMember(m: any): HouseholdMember | null {
  if (!m) return null;
  return {
    householdId: m.household_id,
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at ?? null,
    email: m.email,
  };
}

export interface HouseholdInvite {
  id: string;
  householdId: string;
  invitedBy: string;
  invitedEmail: string;
  role: string;
  status: string;
  createdAt: string;
}

export function mapInvite(i: any): HouseholdInvite | null {
  if (!i) return null;
  return {
    id: i.id,
    householdId: i.household_id,
    invitedBy: i.invited_by,
    invitedEmail: i.invited_email,
    role: i.role,
    status: i.status,
    createdAt: i.created_at ?? "",
  };
}
