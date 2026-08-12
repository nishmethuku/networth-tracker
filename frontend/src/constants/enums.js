/**
 * Domain enums and constants for frontend
 * Mirrors backend enums for type safety
 */

export const ASSET_TYPES = {
  CASH: "cash",
  STOCK: "stock",
  MUTUAL_FUND: "mutual_fund",
  REAL_ESTATE: "real_estate",
  METAL: "metal",
  DEPOSIT: "deposit",
  LOAN: "loan",
};

export const ASSET_TYPE_LABELS = {
  [ASSET_TYPES.CASH]: "Cash",
  [ASSET_TYPES.STOCK]: "Stock",
  [ASSET_TYPES.MUTUAL_FUND]: "Mutual Fund",
  [ASSET_TYPES.REAL_ESTATE]: "Real Estate",
  [ASSET_TYPES.METAL]: "Metal",
  [ASSET_TYPES.DEPOSIT]: "Deposit",
  [ASSET_TYPES.LOAN]: "Loan",
};

// Create options array with specific order as requested
export const ASSET_TYPE_OPTIONS = [
  { value: ASSET_TYPES.CASH, label: ASSET_TYPE_LABELS[ASSET_TYPES.CASH] },
  { value: ASSET_TYPES.STOCK, label: ASSET_TYPE_LABELS[ASSET_TYPES.STOCK] },
  { value: ASSET_TYPES.MUTUAL_FUND, label: ASSET_TYPE_LABELS[ASSET_TYPES.MUTUAL_FUND] },
  { value: ASSET_TYPES.REAL_ESTATE, label: ASSET_TYPE_LABELS[ASSET_TYPES.REAL_ESTATE] },
  { value: ASSET_TYPES.METAL, label: ASSET_TYPE_LABELS[ASSET_TYPES.METAL] },
  { value: ASSET_TYPES.DEPOSIT, label: ASSET_TYPE_LABELS[ASSET_TYPES.DEPOSIT] },
  { value: ASSET_TYPES.LOAN, label: ASSET_TYPE_LABELS[ASSET_TYPES.LOAN] },
];

export const COUNTRIES = [
  "Australia",
  "United States",
  "India",
];

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
