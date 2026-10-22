/**
 * Demo mode: the whole app running on made-up sample data, with no sign-in
 * and no calls to the backend at all. Used to show the site to someone
 * without revealing real numbers.
 *
 * It is switched on per browser tab (sessionStorage) from the login page's
 * "Try the demo" button and switched off with "Exit demo" in the banner.
 * Reads are answered from the sample data below; anything that would save
 * a change is refused, so nothing a visitor does can touch a real account.
 */

const FLAG = "nw_demo";

export function isDemoMode(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function enterDemoMode(): void {
  try {
    window.sessionStorage.setItem(FLAG, "1");
  } catch {
    /* storage blocked: demo cannot start */
  }
}

export function exitDemoMode(): void {
  try {
    window.sessionStorage.removeItem(FLAG);
  } catch {
    /* nothing to clear */
  }
}

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-0000000000de",
  email: "demo@example.com",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};

export const DEMO_READ_ONLY_MESSAGE = "This is a demo with sample data, so changes are not saved. Sign up to track your own money.";

// ---------------------------------------------------------------- sample data

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d;
}

interface DemoHolding {
  id: number;
  asset_type: string;
  symbol: string | null;
  name: string;
  country: string;
  account: string;
  quantity: number | null;
  avg_cost: number | null;
  current_price: number | null;
  value: number;
  cost: number;
  xirr: number | null;
  income: number;
}

const HOLDINGS: DemoHolding[] = [
  {
    id: 1,
    asset_type: "stock",
    symbol: "VTI",
    name: "Vanguard Total Stock Market",
    country: "United States",
    account: "Brokerage",
    quantity: 40,
    avg_cost: 215,
    current_price: 268,
    value: 10720,
    cost: 8600,
    xirr: 0.14,
    income: 96,
  },
  {
    id: 2,
    asset_type: "stock",
    symbol: "AAPL",
    name: "Apple Inc",
    country: "United States",
    account: "Brokerage",
    quantity: 15,
    avg_cost: 160,
    current_price: 228,
    value: 3420,
    cost: 2400,
    xirr: 0.21,
    income: 14,
  },
  {
    id: 3,
    asset_type: "stock",
    symbol: "INTC",
    name: "Intel Corp",
    country: "United States",
    account: "Brokerage",
    quantity: 50,
    avg_cost: 32,
    current_price: 24,
    value: 1200,
    cost: 1600,
    xirr: -0.18,
    income: 0,
  },
  {
    id: 4,
    asset_type: "cash",
    symbol: null,
    name: "High-yield savings",
    country: "United States",
    account: "Bank",
    quantity: null,
    avg_cost: null,
    current_price: null,
    value: 6500,
    cost: 6000,
    xirr: 0.04,
    income: 120,
  },
  {
    id: 5,
    asset_type: "real_estate",
    symbol: null,
    name: "Condo (share)",
    country: "United States",
    account: "Property",
    quantity: null,
    avg_cost: null,
    current_price: null,
    value: 42000,
    cost: 38000,
    xirr: 0.03,
    income: 0,
  },
];

function holdingRow(h: DemoHolding) {
  const qtyBased = h.quantity != null;
  const gain = h.value - h.cost;
  return {
    id: h.id,
    user_id: DEMO_USER.id,
    household_id: null,
    asset_type: h.asset_type,
    symbol: h.symbol,
    name: h.name,
    country: h.country,
    account: h.account,
    institution: null,
    currency: "USD",
    interest_rate: null,
    maturity_date: null,
    sip_amount: null,
    sip_frequency: null,
    sip_start_date: null,
    is_private: false,
    notes: null,
    tags: null,
    status: "active",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    quantity: h.quantity,
    avg_cost: h.avg_cost,
    cost_basis: qtyBased ? h.cost : null,
    display_cost_basis: qtyBased ? h.cost : null,
    current_price: h.current_price,
    realized_gain: qtyBased ? 0 : null,
    unrealized_gain: qtyBased ? gain : null,
    display_unrealized_gain: qtyBased ? gain : null,
    total_gain: qtyBased ? gain : null,
    display_total_gain: qtyBased ? gain : null,
    xirr: h.xirr,
    income_received: h.income,
    display_income_received: h.income,
    first_value: qtyBased ? null : h.cost,
    display_first_value: qtyBased ? null : h.cost,
    gain: qtyBased ? null : gain,
    display_gain: qtyBased ? null : gain,
    current_value: h.value,
    display_value: h.value,
  };
}

const TOTAL_ASSETS = HOLDINGS.reduce((s, h) => s + h.value, 0);
const LIABILITY_BALANCE = 9000;
const NET_WORTH = TOTAL_ASSETS - LIABILITY_BALANCE;

function sum(types: string[]) {
  return HOLDINGS.filter((h) => types.includes(h.asset_type)).reduce((s, h) => s + h.value, 0);
}

function dashboard() {
  const unrealized = HOLDINGS.filter((h) => h.quantity != null).reduce((s, h) => s + (h.value - h.cost), 0);
  const income = HOLDINGS.reduce((s, h) => s + h.income, 0);
  return {
    total_net_worth: NET_WORTH,
    total_assets: TOTAL_ASSETS,
    total_liabilities: LIABILITY_BALANCE,
    currency: "USD",
    portfolio_xirr: 0.12,
    allocation_by_type: [
      { label: "stock", value: sum(["stock"]) },
      { label: "cash", value: sum(["cash"]) },
      { label: "real_estate", value: sum(["real_estate"]) },
    ],
    allocation_by_country: [{ label: "United States", value: TOTAL_ASSETS }],
    allocation_by_currency: [{ label: "USD", value: TOTAL_ASSETS }],
    top_gainers: [
      { id: 2, name: "Apple Inc", symbol: "AAPL", asset_type: "stock", change_pct: 2.4, current_value: 3420 },
      { id: 1, name: "Vanguard Total Stock Market", symbol: "VTI", asset_type: "stock", change_pct: 1.1, current_value: 10720 },
    ],
    top_losers: [{ id: 3, name: "Intel Corp", symbol: "INTC", asset_type: "stock", change_pct: -3.2, current_value: 1200 }],
    realized_gain: 0,
    unrealized_gain: unrealized,
    income_received: income,
  };
}

function netWorthHistory() {
  const rows = [];
  for (let i = 18; i >= 0; i--) {
    const progress = (18 - i) / 18;
    const wobble = Math.sin(i * 1.3) * 0.015;
    const nw = Math.round(NET_WORTH * (0.62 + 0.38 * progress) * (1 + wobble));
    rows.push({
      snapshot_date: iso(monthsAgo(i)),
      total_net_worth: nw,
      total_stock_value: Math.round(nw * 0.3),
      total_property_value: Math.round(nw * 0.55),
      total_profit_loss: 0,
      total_liabilities: LIABILITY_BALANCE,
      by_asset_type: {},
    });
  }
  return rows;
}

function incomeEvents() {
  const events = [
    {
      id: 101,
      holding_id: 1,
      holding_name: "Vanguard Total Stock Market",
      holding_symbol: "VTI",
      asset_type: "stock",
      transaction_type: "dividend",
      months: 1,
      amount: 28,
    },
    {
      id: 102,
      holding_id: 1,
      holding_name: "Vanguard Total Stock Market",
      holding_symbol: "VTI",
      asset_type: "stock",
      transaction_type: "dividend",
      months: 4,
      amount: 36,
    },
    {
      id: 103,
      holding_id: 1,
      holding_name: "Vanguard Total Stock Market",
      holding_symbol: "VTI",
      asset_type: "stock",
      transaction_type: "dividend",
      months: 7,
      amount: 32,
    },
    {
      id: 104,
      holding_id: 2,
      holding_name: "Apple Inc",
      holding_symbol: "AAPL",
      asset_type: "stock",
      transaction_type: "dividend",
      months: 2,
      amount: 14,
    },
    {
      id: 105,
      holding_id: 4,
      holding_name: "High-yield savings",
      holding_symbol: null,
      asset_type: "cash",
      transaction_type: "interest",
      months: 1,
      amount: 30,
    },
    {
      id: 106,
      holding_id: 4,
      holding_name: "High-yield savings",
      holding_symbol: null,
      asset_type: "cash",
      transaction_type: "interest",
      months: 2,
      amount: 30,
    },
    {
      id: 107,
      holding_id: 4,
      holding_name: "High-yield savings",
      holding_symbol: null,
      asset_type: "cash",
      transaction_type: "interest",
      months: 3,
      amount: 30,
    },
    {
      id: 108,
      holding_id: 4,
      holding_name: "High-yield savings",
      holding_symbol: null,
      asset_type: "cash",
      transaction_type: "interest",
      months: 4,
      amount: 30,
    },
  ];
  return events.map((e) => ({
    id: e.id,
    holding_id: e.holding_id,
    holding_name: e.holding_name,
    holding_symbol: e.holding_symbol,
    asset_type: e.asset_type,
    country: "United States",
    transaction_type: e.transaction_type,
    transaction_date: iso(monthsAgo(e.months)),
    quantity: 1,
    price_per_unit: e.amount,
    currency: "USD",
    fees: 0,
    notes: "",
    tags: [],
    created_at: iso(monthsAgo(e.months)),
    funding_source: null,
  }));
}

function allTransactions() {
  const buys = HOLDINGS.filter((h) => h.quantity != null).map((h, i) => ({
    id: 1 + i,
    holding_id: h.id,
    holding_name: h.name,
    holding_symbol: h.symbol,
    asset_type: h.asset_type,
    country: h.country,
    transaction_type: "buy",
    transaction_date: iso(monthsAgo(14 - i * 3)),
    quantity: h.quantity,
    price_per_unit: h.avg_cost,
    currency: "USD",
    fees: 0,
    notes: "",
    tags: [],
    created_at: iso(monthsAgo(14 - i * 3)),
    funding_source: null,
  }));
  return [...incomeEvents(), ...buys].sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1));
}

function incomeSummary() {
  const events = incomeEvents();
  const amounts = events.map((e) => ({ ...e, amount: e.quantity * e.price_per_unit }));
  const byMonth: Record<string, number> = {};
  const byHolding: Record<number, any> = {};
  let total = 0;
  for (const e of amounts) {
    total += e.amount;
    const key = e.transaction_date.slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + e.amount;
    const row = (byHolding[e.holding_id] ||= {
      holding_id: e.holding_id,
      name: e.holding_name,
      symbol: e.holding_symbol,
      total: 0,
      last_12_months: 0,
    });
    row.total += e.amount;
    row.last_12_months += e.amount;
  }
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const key = iso(monthsAgo(i)).slice(0, 7);
    months.push({ month: key, amount: byMonth[key] || 0 });
  }
  const year = new Date().getFullYear();
  return {
    total,
    last_12_months: total,
    yield_pct: (total / (10720 + 3420 + 6500)) * 100,
    by_year: [{ year, amount: total }],
    by_month: months,
    by_holding: Object.values(byHolding).sort((a: any, b: any) => b.total - a.total),
    count: events.length,
  };
}

// ---------------------------------------------------------- sample budget

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function demoBudgetSummary() {
  const now = new Date();
  const expenses = [3650, 3820, 3540, 2050]; // oldest to newest; the current month is partly done
  const months = expenses.map((e, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (expenses.length - 1 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month, income: 5200, expenses: e, net: 5200 - e };
  });
  const category_breakdown = [
    { category: "housing", amount: 1100 },
    { category: "food", amount: 420 },
    { category: "transport", amount: 210 },
    { category: "entertainment", amount: 140 },
    { category: "utilities", amount: 120 },
  ];
  const limits: Record<string, number> = { housing: 1400, food: 600, entertainment: 150 };
  const limit_status = category_breakdown
    .filter((c) => limits[c.category])
    .map((c) => ({
      category: c.category,
      limit: limits[c.category],
      spent: c.amount,
      percent: Math.round((c.amount / limits[c.category]) * 1000) / 10,
    }))
    .sort((a, b) => b.percent - a.percent);
  return {
    currency: "USD",
    months,
    category_breakdown,
    limit_status,
    other_currency_entries: 0,
    latest_month: months[months.length - 1].month,
  };
}

function demoSubscriptions() {
  const soon = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  const items = [
    {
      category: "entertainment",
      description: "Streaming",
      amount: 15.99,
      frequency: "monthly",
      next_due: soon(2),
      monthly_equivalent: 15.99,
    },
    { category: "utilities", description: "Phone plan", amount: 45, frequency: "monthly", next_due: soon(6), monthly_equivalent: 45 },
    { category: "housing", description: "Rent", amount: 1100, frequency: "monthly", next_due: soon(9), monthly_equivalent: 1100 },
    {
      category: "insurance",
      description: "Renters insurance",
      amount: 180,
      frequency: "yearly",
      next_due: soon(80),
      monthly_equivalent: 15,
    },
  ];
  return { currency: "USD", items, monthly_total: items.reduce((s, i) => s + i.monthly_equivalent, 0) };
}

// ------------------------------------------------------------------- routing

const EMPTY_BUDGET_CATEGORIES = {
  income: ["paycheck", "bonus", "interest", "gift", "other_income"],
  expense: [
    "housing",
    "food",
    "transport",
    "utilities",
    "healthcare",
    "entertainment",
    "shopping",
    "education",
    "insurance",
    "other_expense",
  ],
};

/** Answers a GET from the sample data. Unknown endpoints get an empty list,
 * which every list-style screen treats as "nothing here yet". */
export function demoGet(endpoint: string): any {
  const [path, query = ""] = endpoint.split("?");
  const params = new URLSearchParams(query);

  if (path === "/dashboard") return dashboard();
  if (path === "/holdings") return HOLDINGS.map(holdingRow);
  const holdingMatch = path.match(/^\/holdings\/(\d+)$/);
  if (holdingMatch) {
    const h = HOLDINGS.find((x) => x.id === Number(holdingMatch[1]));
    return h ? holdingRow(h) : null;
  }
  const txMatch = path.match(/^\/holdings\/(\d+)\/transactions$/);
  if (txMatch) return allTransactions().filter((t) => t.holding_id === Number(txMatch[1]));
  if (/^\/holdings\/\d+\/(valuations|price-history)$/.test(path)) return [];
  if (path === "/transactions") {
    const all = allTransactions();
    if (!params.get("page")) return all;
    const perPage = Number(params.get("per_page") || 50);
    const page = Number(params.get("page"));
    return {
      items: all.slice((page - 1) * perPage, page * perPage),
      total: all.length,
      page,
      per_page: perPage,
      total_pages: Math.ceil(all.length / perPage),
    };
  }
  if (path === "/net-worth-history") return netWorthHistory();
  if (path === "/income-summary") return incomeSummary();
  if (path === "/liabilities") {
    return [
      {
        id: 1,
        household_id: null,
        name: "Student loan",
        liability_type: "loan",
        currency: "USD",
        current_balance: LIABILITY_BALANCE,
        display_balance: LIABILITY_BALANCE,
        original_amount: 14000,
        interest_rate: 5.5,
        monthly_payment: 220,
        payment_due_date: null,
        notes: "",
        is_private: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
  }
  if (path === "/goals")
    return [
      { id: 1, name: "Reach $100K", target_amount: 100000, currency: "USD", target_date: null, created_at: "2025-01-01T00:00:00Z" },
      {
        id: 2,
        name: "House down payment",
        target_amount: 60000,
        currency: "USD",
        target_date: `${new Date().getFullYear() + 3}-06-01`,
        created_at: "2025-01-01T00:00:00Z",
      },
    ];
  if (path === "/exchange-rates") return { base: "USD", rates: { USD: 1, INR: 83, AUD: 1.5 } };
  if (path === "/benchmark")
    return { portfolio_xirr: 0.12, benchmark_xirr: 0.1, benchmark_symbol: "SPY", benchmark_label: "S&P 500 (SPY)" };
  if (path === "/tax-summary") return { rows: [], disclaimer: null, cost_basis_method: params.get("cost_basis_method") || "average" };
  if (path === "/allocation-targets") return {};
  if (path === "/allocation-drift") return { has_target: false };
  if (path === "/emergency-fund")
    return { currency: "USD", liquid_value: 6500, avg_monthly_expenses: 2200, months_covered: 3, recommended_months: 6 };
  if (path === "/budget/categories") return EMPTY_BUDGET_CATEGORIES;
  if (path === "/budget/summary") return demoBudgetSummary();
  if (path === "/budget/subscriptions") return demoSubscriptions();
  if (path === "/price-cache-status") return {};
  if (path === "/account/digest-subscription") return { subscribed: false };
  return [];
}
