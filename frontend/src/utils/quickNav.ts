export interface QuickPage {
  to: string;
  title: string;
  keywords: string[];
}

export const QUICK_PAGES: QuickPage[] = [
  { to: "/", title: "Dashboard", keywords: ["home", "net worth", "overview"] },
  { to: "/portfolio", title: "Portfolio", keywords: ["holdings", "stocks", "investments"] },
  { to: "/add-holding", title: "Add holding", keywords: ["new", "create", "buy"] },
  { to: "/transactions", title: "Transactions", keywords: ["history", "buys", "sells", "dividends"] },
  { to: "/liabilities", title: "Liabilities", keywords: ["debt", "loans", "mortgage", "credit card"] },
  { to: "/budget", title: "Budget", keywords: ["spending", "expenses", "income", "subscriptions", "bills"] },
  { to: "/income", title: "Income", keywords: ["dividends", "interest", "yield"] },
  { to: "/insights", title: "Insights", keywords: ["milestones", "trends", "monthly"] },
  { to: "/review", title: "Year in Review", keywords: ["recap", "annual", "summary", "print"] },
  { to: "/what-if", title: "What-If", keywords: ["calculator", "projection", "retire", "fire", "future"] },
  { to: "/allocation-advisor", title: "Allocation advisor", keywords: ["rebalance", "target", "diversify"] },
  { to: "/tax-summary", title: "Tax summary", keywords: ["gains", "capital", "harvest", "taxes"] },
  { to: "/alerts", title: "Alerts", keywords: ["price", "notify", "notifications"] },
  { to: "/accounts", title: "Accounts", keywords: ["brokerage", "bank", "institutions"] },
  { to: "/household", title: "Household", keywords: ["family", "share", "members", "invite"] },
  { to: "/import", title: "Import CSV", keywords: ["upload", "csv", "file"] },
  { to: "/import-spreadsheet", title: "Import spreadsheet", keywords: ["excel", "xlsx", "upload"] },
  { to: "/import-bank-statement", title: "Import bank statement", keywords: ["pdf", "statement", "upload"] },
  { to: "/settings", title: "Settings", keywords: ["export", "backup", "password", "theme", "currency", "language", "2fa", "install"] },
];

function score(page: QuickPage, q: string): number {
  const title = page.title.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (title.includes(q)) return 50;
  if (page.keywords.some((k) => k.startsWith(q))) return 40;
  if (page.keywords.some((k) => k.includes(q))) return 20;
  return 0;
}

/** Pages whose name or keywords match what was typed, best first. Short queries only; long sentences are for the AI search. */
export function matchPages(query: string, limit = 5): QuickPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (q.split(/\s+/).length > 3) return [];
  return QUICK_PAGES.map((p) => ({ p, s: score(p, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}
