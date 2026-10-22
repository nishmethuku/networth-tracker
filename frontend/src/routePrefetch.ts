// Start downloading a page's code when a menu link is hovered or focused, so it opens instantly.
// These are the same dynamic imports App.jsx uses, so the browser reuses the download.
const loaders: Record<string, () => Promise<unknown>> = {
  "/portfolio": () => import("./components/Portfolio"),
  "/add-holding": () => import("./components/AddHolding"),
  "/transactions": () => import("./components/Transactions"),
  "/liabilities": () => import("./components/Liabilities"),
  "/budget": () => import("./components/Budget"),
  "/expenses": () => import("./components/Expenses"),
  "/import": () => import("./components/ImportCsv"),
  "/alerts": () => import("./components/Alerts"),
  "/tax-summary": () => import("./components/TaxSummary"),
  "/insights": () => import("./components/Insights"),
  "/allocation-advisor": () => import("./components/ai/AllocationAdvisor"),
  "/what-if": () => import("./components/WhatIf"),
  "/income": () => import("./components/Income"),
  "/settings": () => import("./components/Settings"),
  "/household": () => import("./components/Household"),
  "/accounts": () => import("./components/Accounts"),
};

const started = new Set<string>();

export function prefetchRoute(path: string): void {
  if (started.has(path)) return;
  const load = loaders[path];
  if (!load) return;
  started.add(path);
  load().catch(() => started.delete(path));
}
