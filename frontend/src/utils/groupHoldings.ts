import { pooledXirr } from "./xirr";

/** Several lots of the same stock (same type, symbol and currency) shown as one position. */
export function groupLots<T extends Record<string, any>>(holdings: T[]): (T & { lots: T[] })[] {
  const groups = new Map<string, T[]>();
  for (const h of holdings) {
    const key = `${h.assetType}|${(h.symbol || h.name || "").toUpperCase()}|${h.currency}`;
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }
  return [...groups.values()].map((lots) => {
    if (lots.length === 1) return { ...lots[0], lots };
    const sum = (f: (h: T) => number | null | undefined) => lots.reduce((s, h) => s + (f(h) ?? 0), 0);
    const quantity = sum((h) => h.quantity);
    const displayCostBasis = sum((h) => h.displayCostBasis);
    const displayValue = sum((h) => h.displayValue);
    const accounts = [...new Set(lots.map((h) => h.account).filter(Boolean))];
    const flows = lots.flatMap((h) => h.cashFlows || []);
    const first = lots[0];
    return {
      ...first,
      quantity,
      displayCostBasis,
      costBasis: displayCostBasis,
      displayValue,
      displayTotalGain: sum((h) => h.displayTotalGain),
      totalGain: sum((h) => h.displayTotalGain),
      xirr: pooledXirr(flows, displayValue),
      account: accounts.length > 1 ? `${accounts.length} accounts` : accounts[0] || "",
      lots,
    };
  });
}
