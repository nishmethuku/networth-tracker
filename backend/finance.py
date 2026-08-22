from datetime import date
from typing import List, Optional, Tuple


def _xnpv(rate: float, cash_flows: List[Tuple[date, float]]) -> float:
    """Net present value of dated cash flows at `rate`, using Actual/365 day counting."""
    if rate <= -1.0:
        return float("inf")
    t0 = cash_flows[0][0]
    return sum(
        cf / (1.0 + rate) ** ((d - t0).days / 365.0) for d, cf in cash_flows
    )


def _xnpv_derivative(rate: float, cash_flows: List[Tuple[date, float]]) -> float:
    if rate <= -1.0:
        return float("inf")
    t0 = cash_flows[0][0]
    result = 0.0
    for d, cf in cash_flows:
        years = (d - t0).days / 365.0
        result += -years * cf / (1.0 + rate) ** (years + 1)
    return result


def xirr(cash_flows: List[Tuple[date, float]], guess: float = 0.1) -> Optional[float]:
    """
    True annualized return from a series of dated cash flows (buys negative,
    sells/current value positive) — the same calculation as Excel/Sheets XIRR.
    Solved via Newton's method with a bisection fallback. Returns None if the
    flows don't have both an inflow and an outflow, or if no root is found.
    """
    if not cash_flows or len(cash_flows) < 2:
        return None

    flows = sorted(cash_flows, key=lambda cf: cf[0])

    if not any(amount < 0 for _, amount in flows) or not any(amount > 0 for _, amount in flows):
        return None

    rate = guess
    for _ in range(100):
        f = _xnpv(rate, flows)
        df = _xnpv_derivative(rate, flows)
        if df == 0:
            break
        new_rate = rate - f / df
        if new_rate <= -1.0:
            new_rate = -0.999999
        # A diverging rate pushes both f and df toward the float underflow
        # floor, at which point f/df can round to exactly 0.0 and the
        # step-size convergence check below falsely reports convergence —
        # on whatever absurd magnitude the rate diverged to. Bail out to
        # the bisection fallback (which checks the NPV itself, not the
        # step size, and searches a bounded, sane range) instead.
        if not (-0.999999 <= new_rate <= 50.0):
            break
        if abs(new_rate - rate) < 1e-6:
            return new_rate
        rate = new_rate

    # Newton's method didn't converge from this guess — fall back to bisection
    # over a wide, sane range.
    low, high = -0.999999, 10.0
    f_low = _xnpv(low, flows)
    f_high = _xnpv(high, flows)
    if f_low * f_high > 0:
        return None

    for _ in range(200):
        mid = (low + high) / 2
        f_mid = _xnpv(mid, flows)
        if abs(f_mid) < 1e-6:
            return mid
        if f_low * f_mid < 0:
            high = mid
        else:
            low, f_low = mid, f_mid

    return None
