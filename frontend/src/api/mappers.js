/**
 * Data mapping layer: normalize backend responses into frontend-friendly objects
 */
import { safeNumber } from "../utils/formatters";

export function mapHolding(h) {
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
    tags: h.tags ? h.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    status: h.status ?? "active",
    createdAt: h.created_at ?? "",
    updatedAt: h.updated_at ?? "",

    // Quantity-based metrics (stock/mutual_fund/crypto/commodity)
    quantity: h.quantity != null ? safeNumber(h.quantity) : null,
    avgCost: h.avg_cost != null ? safeNumber(h.avg_cost) : null,
    costBasis: h.cost_basis != null ? safeNumber(h.cost_basis) : null,
    currentPrice: h.current_price != null ? safeNumber(h.current_price) : null,
    realizedGain: h.realized_gain != null ? safeNumber(h.realized_gain) : null,
    unrealizedGain: h.unrealized_gain != null ? safeNumber(h.unrealized_gain) : null,
    totalGain: h.total_gain != null ? safeNumber(h.total_gain) : null,
    xirr: h.xirr != null ? safeNumber(h.xirr) : null,

    // Valuation-based metrics (real_estate/fixed_deposit/ppf/epf/cash/loan)
    firstValue: h.first_value != null ? safeNumber(h.first_value) : null,
    gain: h.gain != null ? safeNumber(h.gain) : null,
    history: h.history || null,

    // Common
    currentValue: safeNumber(h.current_value),
    displayValue: safeNumber(h.display_value ?? h.current_value),

    displayName: h.symbol || h.name || `Holding #${h.id}`,
  };
}

export function mapTransaction(t) {
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
  };
}

export function mapValuation(v) {
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

export function mapDashboard(d) {
  if (!d) return null;
  return {
    totalNetWorth: safeNumber(d.total_net_worth),
    currency: d.currency ?? "USD",
    allocationByType: (d.allocation_by_type || []).map((a) => ({
      label: a.label,
      value: safeNumber(a.value),
    })),
    allocationByCountry: (d.allocation_by_country || []).map((a) => ({
      label: a.label,
      value: safeNumber(a.value),
    })),
    topGainers: (d.top_gainers || []).map(mapMover),
    topLosers: (d.top_losers || []).map(mapMover),
    realizedGain: safeNumber(d.realized_gain),
    unrealizedGain: safeNumber(d.unrealized_gain),
  };
}

function mapMover(m) {
  return {
    id: m.id,
    name: m.name,
    symbol: m.symbol,
    assetType: m.asset_type,
    changePct: safeNumber(m.change_pct),
    currentValue: safeNumber(m.current_value),
  };
}

export function mapNetWorthHistory(rows) {
  return (rows || []).map((r) => ({
    date: r.snapshot_date,
    netWorth: safeNumber(r.total_net_worth),
    stockValue: safeNumber(r.total_stock_value),
    propertyValue: safeNumber(r.total_property_value),
    profitLoss: safeNumber(r.total_profit_loss),
    byAssetType: r.by_asset_type || {},
  }));
}

export function mapPriceHistory(rows) {
  return (rows || []).map((r) => ({
    date: r.price_date,
    price: safeNumber(r.price),
    currency: r.currency,
    source: r.source,
  }));
}

export function mapAlert(a) {
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

export function mapMilestone(m) {
  if (!m) return null;
  return {
    id: m.id,
    userId: m.user_id,
    householdId: m.household_id,
    threshold: safeNumber(m.threshold),
    currency: m.currency,
    achievedDate: m.achieved_date,
    acknowledged: !!m.acknowledged,
  };
}

export function mapTaxSummary(response) {
  const rows = response?.rows || (Array.isArray(response) ? response : []);
  return {
    disclaimer: response?.disclaimer || null,
    rows: rows.map((r) => ({
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
      byHolding: (r.by_holding || []).map((h) => ({ name: h.name, realizedGain: safeNumber(h.realized_gain) })),
    })),
  };
}

export function mapBenchmark(b) {
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

export function mapBudgetEntry(e) {
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
  };
}

export function mapBudgetLimit(l) {
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
