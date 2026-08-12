from datetime import date
from math import pow


def years_between(start: date, end: date) -> float:
    # Avoid extremely tiny year fractions which can cause huge exponents
    # and overflow in CAGR calculation.
    raw_years = (end - start).days / 365.25
    return max(raw_years, 0.01)


def calculate_cagr(buy_value: float, current_value: float, purchase_date: date) -> float:
    if buy_value <= 0 or current_value <= 0:
        return 0.0

    years = years_between(purchase_date, date.today())
    try:
        return pow(current_value / buy_value, 1 / years) - 1
    except OverflowError:
        # If for any reason the math still overflows (e.g. extreme ratios),
        # fall back to 0 instead of crashing the request.
        return 0.0
