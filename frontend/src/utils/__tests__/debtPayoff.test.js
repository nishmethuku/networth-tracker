import { describe, it, expect } from "vitest";
import { projectPayoff, monthsToPayoff } from "../debtPayoff";

describe("projectPayoff", () => {
  it("pays off a zero-interest loan in balance/payment months", () => {
    const points = projectPayoff({ balance: 1200, annualRatePct: 0, monthlyPayment: 100 });
    expect(monthsToPayoff(points)).toBe(12);
    expect(points[points.length - 1].balance).toBeCloseTo(0);
  });

  it("accrues interest before applying principal each month", () => {
    // $1000 @ 12%/yr (1%/mo), $100/mo payment.
    // Month 1: interest = 10, principal = 90, balance = 910.
    const points = projectPayoff({ balance: 1000, annualRatePct: 12, monthlyPayment: 100 });
    expect(points[1].balance).toBeCloseTo(910, 1);
    expect(points[1].interestPaid).toBeCloseTo(10, 1);
    expect(points[1].principalPaid).toBeCloseTo(90, 1);
  });

  it("never reaches payoff if the payment doesn't cover monthly interest", () => {
    // $10,000 @ 24%/yr (2%/mo = $200/mo interest) with only a $150/mo payment.
    const points = projectPayoff({ balance: 10000, annualRatePct: 24, monthlyPayment: 150 });
    expect(monthsToPayoff(points)).toBeNull();
  });

  it("a higher payment pays off strictly faster, all else equal", () => {
    const slow = projectPayoff({ balance: 5000, annualRatePct: 8, monthlyPayment: 150 });
    const fast = projectPayoff({ balance: 5000, annualRatePct: 8, monthlyPayment: 400 });
    expect(monthsToPayoff(fast)).toBeLessThan(monthsToPayoff(slow));
  });

  it("returns just the starting point for an already-zero balance", () => {
    const points = projectPayoff({ balance: 0, annualRatePct: 5, monthlyPayment: 100 });
    expect(points).toHaveLength(1);
    expect(points[0].balance).toBe(0);
  });
});

describe("monthsToPayoff", () => {
  it("returns null when never paid off within the horizon", () => {
    expect(monthsToPayoff([{ month: 600, balance: 500, interestPaid: 0, principalPaid: 0 }])).toBeNull();
  });
});
