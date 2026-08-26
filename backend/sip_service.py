"""
Recurring investment (SIP) math: upcoming contribution dates and a
projected future value. Both are pure functions of the holding's SIP
settings — no live data involved beyond the XIRR already computed
elsewhere, which the caller passes in.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

FREQUENCY_DAYS = {"weekly": 7, "monthly": 30, "quarterly": 91, "yearly": 365}
PERIODS_PER_YEAR = {"weekly": 52, "monthly": 12, "quarterly": 4, "yearly": 1}


def _advance(d: date, frequency: str, n: int) -> date:
    """Adds n periods to d. Monthly/quarterly/yearly advance by calendar
    months (not a fixed day count) so a start date of the 31st doesn't
    drift."""
    if frequency == "weekly":
        return d + timedelta(weeks=n)
    months_per_period = {"monthly": 1, "quarterly": 3, "yearly": 12}[frequency]
    total_months = (d.month - 1) + n * months_per_period
    year = d.year + total_months // 12
    month = total_months % 12 + 1
    # Clamp the day for months shorter than the start day (e.g. day 31 in April).
    day = d.day
    while True:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1


def next_occurrences(start_date: date, frequency: str, count: int = 3, today: Optional[date] = None) -> List[str]:
    if frequency not in FREQUENCY_DAYS or not start_date:
        return []
    today = today or date.today()

    n = 0
    current = start_date
    # Fast-forward past dates without an unbounded loop for very old start
    # dates. approx_days is a fixed average (e.g. 30 for "monthly") but
    # _advance moves by real calendar months, which average ~30.44 days --
    # so the day-count estimate below drifts increasingly optimistic
    # (overshoots n) the longer the SIP has been running: for a 20-year-old
    # monthly SIP this overshot by a full period, silently skipping the
    # true next occurrence entirely (found by hand-computing against a
    # brute-force walk). The forward loop alone only ever corrects an
    # undershoot; the backward loop after it corrects the overshoot case
    # symmetrically, landing on the smallest n that's actually >= today
    # regardless of which direction the approximation errs.
    if current < today:
        approx_days = FREQUENCY_DAYS[frequency]
        elapsed_periods = max(0, (today - start_date).days // approx_days - 1)
        n = elapsed_periods
        current = _advance(start_date, frequency, n)
        while current < today:
            n += 1
            current = _advance(start_date, frequency, n)
        while n > 0 and _advance(start_date, frequency, n - 1) >= today:
            n -= 1
            current = _advance(start_date, frequency, n)

    results = []
    while len(results) < count:
        occurrence = _advance(start_date, frequency, n)
        if occurrence >= today:
            results.append(occurrence.isoformat())
        n += 1
    return results


def project_future_value(
    current_value: float, sip_amount: float, frequency: str, annual_rate: Optional[float], years: float
) -> Dict:
    """Future value of the current holding plus `years` more of SIP
    contributions, compounding at annual_rate (the holding's own XIRR, or a
    conservative default if XIRR isn't available yet). Assumes contributions
    at the start of each period (annuity due) and a constant periodic rate
    derived from the annual rate — a standard, simplified SIP projection,
    not a guarantee."""
    periods_per_year = PERIODS_PER_YEAR.get(frequency)
    if not periods_per_year or years <= 0:
        return {"projected_value": current_value, "total_contributions": 0.0, "assumed_annual_rate": annual_rate}

    rate = annual_rate if annual_rate is not None else 0.08  # conservative default until real XIRR exists
    n = round(periods_per_year * years)
    periodic_rate = (1 + rate) ** (1 / periods_per_year) - 1

    fv_current = current_value * (1 + rate) ** years

    if abs(periodic_rate) < 1e-9:
        fv_contributions = sip_amount * n
    else:
        fv_contributions = sip_amount * (((1 + periodic_rate) ** n - 1) / periodic_rate) * (1 + periodic_rate)

    return {
        "projected_value": round(fv_current + fv_contributions, 2),
        "total_contributions": round(sip_amount * n, 2),
        "assumed_annual_rate": rate,
    }
