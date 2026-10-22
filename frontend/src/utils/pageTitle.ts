const TITLES: Record<string, string> = {
  "/": "Net Worth",
  "/portfolio": "Portfolio",
  "/liabilities": "Liabilities",
  "/add-holding": "Add holding",
  "/transactions": "Transactions",
  "/budget": "Budget",
  "/expenses": "Expenses",
  "/import-spreadsheet": "Import spreadsheet",
  "/import-bank-statement": "Import bank statement",
  "/import": "Import CSV",
  "/alerts": "Alerts",
  "/tax-summary": "Tax summary",
  "/insights": "Insights",
  "/allocation-advisor": "Allocation advisor",
  "/what-if": "What-If",
  "/income": "Income",
  "/review": "Year in Review",
  "/settings": "Settings",
  "/household": "Household",
  "/accounts": "Accounts",
};

export const APP_NAME = "Personal Net Worth Tracker";

/** Browser tab title for a path, so tabs, history and screen readers say where you are. */
export function pageTitle(pathname: string): string {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const name = TITLES[clean] ?? (clean.startsWith("/portfolio/") ? "Holding" : null);
  return name ? `${name} · ${APP_NAME}` : APP_NAME;
}
