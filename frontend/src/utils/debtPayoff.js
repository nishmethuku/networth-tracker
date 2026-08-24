/**
 * Standard loan amortization: each month, interest accrues on the
 * remaining balance at the monthly rate, then the payment covers that
 * interest first and whatever's left reduces principal. Capped at 50 years
 * so a payment too small to cover the interest (balance never shrinks)
 * terminates instead of looping forever.
 */
const MAX_MONTHS = 600;

export function projectPayoff({ balance, annualRatePct, monthlyPayment }) {
  const r = annualRatePct / 100 / 12;
  const points = [{ month: 0, balance, interestPaid: 0, principalPaid: 0 }];
  if (balance <= 0 || monthlyPayment <= 0) return points;

  let bal = balance;
  let totalInterest = 0;
  let totalPrincipal = 0;

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const interest = bal * r;
    if (monthlyPayment <= interest && r > 0) break; // payment doesn't even cover interest -- balance would never shrink
    const principal = Math.min(monthlyPayment - interest, bal);
    bal -= principal;
    totalInterest += interest;
    totalPrincipal += principal;
    points.push({ month, balance: Math.max(0, bal), interestPaid: totalInterest, principalPaid: totalPrincipal });
    if (bal <= 0.005) break;
  }

  return points;
}

/** The month payoff was reached, or null if the payment never gets there
 * within the horizon (too small, or doesn't cover interest at all). */
export function monthsToPayoff(points) {
  const last = points[points.length - 1];
  return last && last.balance <= 0.01 && last.month > 0 ? last.month : null;
}
