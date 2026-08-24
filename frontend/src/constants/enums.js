/**
 * Domain enums and constants for frontend
 * Mirrors backend enums for type safety
 */

export const ASSET_TYPES = {
  STOCK: "stock",
  MUTUAL_FUND: "mutual_fund",
  CRYPTO: "crypto",
  COMMODITY: "commodity",
  REAL_ESTATE: "real_estate",
  FIXED_DEPOSIT: "fixed_deposit",
  PPF: "ppf",
  EPF: "epf",
  RETIRALS: "retirals",
  CASH: "cash",
  LOAN: "loan",
  CREDIT: "credit",
};

// Mirrors backend holdings_service.TRANSACTION_TYPES/INCOME_TRANSACTION_TYPES.
// Dividend/interest don't change quantity or cost basis (see AddTransactionForm
// in HoldingDetail.jsx), so anywhere a transaction's type drives a buy/sell-style
// display (color, "@ price" phrasing) needs to branch on this too.
export const TRANSACTION_TYPES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "interest", label: "Interest" },
];
export const INCOME_TRANSACTION_TYPES = ["dividend", "interest"];

export function isIncomeTransactionType(transactionType) {
  return INCOME_TRANSACTION_TYPES.includes(transactionType);
}

export const ASSET_TYPE_LABELS = {
  [ASSET_TYPES.STOCK]: "Stocks",
  [ASSET_TYPES.MUTUAL_FUND]: "Mutual Funds",
  [ASSET_TYPES.CRYPTO]: "Crypto",
  [ASSET_TYPES.COMMODITY]: "Gold & Metals",
  [ASSET_TYPES.REAL_ESTATE]: "Real Estate",
  [ASSET_TYPES.FIXED_DEPOSIT]: "Fixed Deposits",
  [ASSET_TYPES.PPF]: "PPF",
  [ASSET_TYPES.EPF]: "EPF",
  [ASSET_TYPES.RETIRALS]: "Retirals",
  [ASSET_TYPES.CASH]: "Cash & Bank Accounts",
  [ASSET_TYPES.LOAN]: "Loans",
  [ASSET_TYPES.CREDIT]: "Credit Given",
};

// Types that track buy/sell transactions (quantity + price per unit)
export const QUANTITY_BASED_TYPES = [
  ASSET_TYPES.STOCK,
  ASSET_TYPES.MUTUAL_FUND,
  ASSET_TYPES.CRYPTO,
  ASSET_TYPES.COMMODITY,
];

// Types that track periodic value updates instead (no "buy/sell", just a balance/value)
export const VALUATION_BASED_TYPES = [
  ASSET_TYPES.REAL_ESTATE,
  ASSET_TYPES.FIXED_DEPOSIT,
  ASSET_TYPES.PPF,
  ASSET_TYPES.EPF,
  ASSET_TYPES.RETIRALS,
  ASSET_TYPES.CASH,
  ASSET_TYPES.LOAN,
  ASSET_TYPES.CREDIT,
];

export const ASSET_TYPE_OPTIONS = Object.values(ASSET_TYPES).map((value) => ({
  value,
  label: ASSET_TYPE_LABELS[value],
}));

export const COUNTRIES = ["Australia", "United States", "India"];

export const CURRENCIES = ["USD", "INR", "AUD"];

export const ACCOUNT_TYPES = [
  "Brokerage",
  "Retirement",
  "Savings",
  "Checking",
  "Investment",
  "Other",
];

export function isValidAssetType(value) {
  return Object.values(ASSET_TYPES).includes(value);
}

export function getAssetTypeLabel(value) {
  return ASSET_TYPE_LABELS[value] || value;
}

export function isQuantityBased(assetType) {
  return QUANTITY_BASED_TYPES.includes(assetType);
}

// Mirrors backend liability_service.LIABILITY_TYPES.
export const LIABILITY_TYPES = {
  MORTGAGE: "mortgage",
  CREDIT_CARD: "credit_card",
  AUTO_LOAN: "auto_loan",
  STUDENT_LOAN: "student_loan",
  PERSONAL_LOAN: "personal_loan",
  LINE_OF_CREDIT: "line_of_credit",
  OTHER: "other",
};

export const LIABILITY_TYPE_LABELS = {
  [LIABILITY_TYPES.MORTGAGE]: "Mortgage",
  [LIABILITY_TYPES.CREDIT_CARD]: "Credit Card",
  [LIABILITY_TYPES.AUTO_LOAN]: "Auto Loan",
  [LIABILITY_TYPES.STUDENT_LOAN]: "Student Loan",
  [LIABILITY_TYPES.PERSONAL_LOAN]: "Personal Loan",
  [LIABILITY_TYPES.LINE_OF_CREDIT]: "Line of Credit",
  [LIABILITY_TYPES.OTHER]: "Other Debt",
};

export const LIABILITY_TYPE_OPTIONS = Object.values(LIABILITY_TYPES).map((value) => ({
  value,
  label: LIABILITY_TYPE_LABELS[value],
}));

export function getLiabilityTypeLabel(value) {
  return LIABILITY_TYPE_LABELS[value] || value;
}

export const BUDGET_CATEGORY_LABELS = {
  paycheck: "Paycheck",
  bonus: "Bonus",
  interest: "Interest",
  gift: "Gift",
  other_income: "Other income",
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  utilities: "Utilities",
  healthcare: "Healthcare",
  entertainment: "Entertainment",
  shopping: "Shopping",
  education: "Education",
  insurance: "Insurance",
  other_expense: "Other expense",
};

export function getBudgetCategoryLabel(value) {
  return BUDGET_CATEGORY_LABELS[value] || value;
}
