export interface DatedFlow {
  date: string; // yyyy-mm-dd
  amount: number; // buys negative, sells and the current value positive
}

const DAY_MS = 86400000;

function parseDay(d: string): number {
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
}

function npv(rate: number, flows: { t: number; amount: number }[]): number {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.t), 0);
}

function npvDerivative(rate: number, flows: { t: number; amount: number }[]): number {
  return flows.reduce((sum, f) => sum - (f.t * f.amount) / Math.pow(1 + rate, f.t + 1), 0);
}

/**
 * Annualized return over dated cash flows (the same calculation as Excel/Sheets XIRR and the
 * backend's finance.xirr). Returns null unless there is at least one outflow and one inflow.
 */
export function xirr(cashFlows: DatedFlow[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => parseDay(a.date) - parseDay(b.date));
  if (!sorted.some((f) => f.amount < 0) || !sorted.some((f) => f.amount > 0)) return null;
  const t0 = parseDay(sorted[0].date);
  const flows = sorted.map((f) => ({ t: (parseDay(f.date) - t0) / DAY_MS / 365, amount: f.amount }));

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate, flows);
    const df = npvDerivative(rate, flows);
    if (df === 0) break;
    let next = rate - f / df;
    if (next <= -1) next = -0.999999;
    if (!(next >= -0.999999 && next <= 50)) break;
    if (Math.abs(next - rate) < 1e-6) return next;
    rate = next;
  }

  let low = -0.999999;
  let high = 10;
  const fLow = npv(low, flows);
  const fHigh = npv(high, flows);
  if (fLow * fHigh > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLow * fMid < 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/**
 * XIRR for a set of lots held together: every lot's dated purchases and sales are pooled, with the
 * combined current value as the final flow. This is NOT an average of each lot's own XIRR (lots
 * bought on different days earn at different rates, and an average would ignore both timing and size).
 * Like the backend, a position younger than 30 days returns null rather than a wild annualized number.
 */
export function pooledXirr(flows: DatedFlow[], currentValue: number, today: Date = new Date()): number | null {
  if (flows.length === 0) return null;
  const todayIso = today.toISOString().slice(0, 10);
  const earliest = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
  if ((parseDay(todayIso) - parseDay(earliest)) / DAY_MS < 30) return null;
  const all = [...flows];
  if (currentValue > 0) all.push({ date: todayIso, amount: currentValue });
  return xirr(all);
}
