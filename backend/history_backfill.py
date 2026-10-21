"""
Rebuilds a user's past net worth from what is already recorded: buy/sell
transactions (to know how many units were held on a past date), historical
prices, and historical exchange rates. Used by
scripts/backfill_net_worth_history.py to fill in the "Net Worth Over Time"
chart for the period before daily snapshots started.

Everything here is pure -- price and FX lookups are passed in as functions --
so the logic is unit-tested without a database or network.

Deliberately conservative: if any position held on a date has no price, or a
needed exchange rate is missing, that date is skipped rather than recorded
with a misleadingly low number.
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Optional

QUANTITY_BASED_TYPES = ("stock", "mutual_fund", "crypto", "commodity")


@dataclass
class HoldingRecord:
    asset_type: str
    symbol: Optional[str]
    currency: str
    # (date, "buy" | "sell", quantity)
    transactions: list = field(default_factory=list)
    # (date, value, currency)
    valuations: list = field(default_factory=list)


# price_fn(asset_type, symbol, on_date) -> (price, price_currency) or None
PriceFn = Callable[[str, str, date], Optional[tuple]]
# rate_fn(from_currency, to_currency, on_date) -> float or None
RateFn = Callable[[str, str, date], Optional[float]]


def net_quantity_on(transactions, on_date: date) -> float:
    """Units held at the end of on_date: buys add, sells subtract."""
    qty = 0.0
    for tx_date, tx_type, quantity in transactions:
        if tx_date > on_date:
            continue
        if tx_type == "buy":
            qty += quantity
        elif tx_type == "sell":
            qty -= quantity
    return max(qty, 0.0)


def valuation_on(valuations, on_date: date):
    """The latest recorded (value, currency) on or before on_date, or None."""
    best = None
    for val_date, value, currency in valuations:
        if val_date <= on_date and (best is None or val_date >= best[0]):
            best = (val_date, value, currency)
    return (best[1], best[2]) if best else None


def month_starts(first_date: date, last_date: date) -> list:
    """The 1st of every month from first_date's month up to (not including)
    last_date, skipping any 1st that falls before first_date itself."""
    out = []
    y, m = first_date.year, first_date.month
    while True:
        d = date(y, m, 1)
        if d >= last_date:
            break
        if d >= first_date:
            out.append(d)
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def breakdown_on(holdings, on_date: date, price_fn: PriceFn, rate_fn: RateFn, target_currency: str = "USD"):
    """Asset value on on_date in target_currency, split by asset type.

    Returns (by_type, missing). by_type is None if anything needed could not
    be priced/converted, and missing lists what was missing.
    """
    by_type = {}
    missing = []

    def to_target(amount, from_currency, label):
        if from_currency == target_currency:
            return amount
        rate = rate_fn(from_currency, target_currency, on_date)
        if rate is None:
            missing.append(f"{from_currency}->{target_currency} rate for {label}")
            return None
        return amount * rate

    for h in holdings:
        label = h.symbol or h.asset_type
        if h.asset_type in QUANTITY_BASED_TYPES:
            qty = net_quantity_on(h.transactions, on_date)
            if qty <= 0:
                continue
            priced = price_fn(h.asset_type, h.symbol, on_date) if h.symbol else None
            if priced is None:
                missing.append(f"price for {label}")
                continue
            price, price_currency = priced
            converted = to_target(qty * price, price_currency, label)
            if converted is not None:
                by_type[h.asset_type] = by_type.get(h.asset_type, 0.0) + converted
        else:
            val = valuation_on(h.valuations, on_date)
            if val is None:
                continue
            value, currency = val
            converted = to_target(value, currency, label)
            if converted is not None:
                by_type[h.asset_type] = by_type.get(h.asset_type, 0.0) + converted

    if missing:
        return None, missing
    return by_type, []


def net_worth_on(holdings, on_date: date, price_fn: PriceFn, rate_fn: RateFn, target_currency: str = "USD"):
    """Total asset value on on_date. Returns (total, missing); total is None
    if anything needed could not be priced/converted."""
    by_type, missing = breakdown_on(holdings, on_date, price_fn, rate_fn, target_currency)
    if by_type is None:
        return None, missing
    return sum(by_type.values()), []


def earliest_activity(holdings) -> Optional[date]:
    """First date anything was recorded across all holdings, or None."""
    dates = []
    for h in holdings:
        dates.extend(d for d, _, _ in h.transactions)
        dates.extend(d for d, _, _ in h.valuations)
    return min(dates) if dates else None


def reconstruct_series(holdings, dates, price_fn: PriceFn, rate_fn: RateFn, target_currency: str = "USD"):
    """For each date, the reconstructed total (or a skip reason).

    Returns a list of dicts: {"date", "total", "by_asset_type"} for dates that
    could be computed, and {"date", "skipped": [reasons]} for those that could not.
    Dates with no holdings yet (total of exactly 0) are omitted.
    """
    out = []
    for d in dates:
        by_type, missing = breakdown_on(holdings, d, price_fn, rate_fn, target_currency)
        if by_type is None:
            out.append({"date": d, "skipped": missing})
            continue
        total = sum(by_type.values())
        if total > 0:
            out.append({"date": d, "total": round(total, 2), "by_asset_type": {k: round(v, 2) for k, v in by_type.items()}})
    return out
