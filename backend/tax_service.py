"""
Realized gains grouped by financial year, for tax-season reference.
India uses Apr 1–Mar 31; everything else uses the calendar year.

Also estimates short-term vs long-term classification and a rough tax
liability. Both are approximations, not tax advice: holding-period
classification uses a uniform "more than one calendar year" rule via FIFO
lot matching (actual rules vary by country and asset class — e.g. India's
debt fund taxation differs from equity), and the liability estimate uses
flat illustrative rates rather than each country's actual bracket/exemption
rules. Every response carries an explicit disclaimer for this reason.
"""
from datetime import date
from typing import Dict, List, Optional

from .holdings_service import compute_position, QUANTITY_BASED_TYPES
from .models import Holding, HoldingTransaction

def _one_year_later(d: date) -> date:
    """d's calendar anniversary one year later — used instead of a fixed
    365-day threshold, which misclassifies any holding period spanning a
    Feb 29: e.g. bought 2024-01-01 (a leap year) and sold exactly one
    calendar year later on 2025-01-01 is 366 days apart, which a flat
    365-day cutoff would wrongly call long-term."""
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        # d itself is Feb 29 — land on Feb 28 in the (non-leap) next year.
        return d.replace(month=2, day=28, year=d.year + 1)


TAX_DISCLAIMER = (
    "Rough estimate only, not tax advice. Short/long-term is classified using a uniform "
    "365-day FIFO rule and liability uses flat illustrative rates — actual rules vary by "
    "country, asset class, and income bracket. Consult a tax professional."
)

# Flat, illustrative rates — not each country's real bracket/exemption structure.
TAX_RATES = {
    "India": {"short_term_rate": 0.15, "long_term_rate": 0.10, "long_term_exemption": 100000},
    "United States": {"short_term_rate": 0.24, "long_term_rate": 0.15, "long_term_exemption": 0},
    # Long-term rate assumes a ~32.5% marginal rate with Australia's 50% CGT discount applied.
    "Australia": {"short_term_rate": 0.325, "long_term_rate": 0.1625, "long_term_exemption": 0},
}


def financial_year_label(d: date, country: str) -> str:
    if country == "India":
        # e.g. Nov 2024 -> "FY2024-25", Feb 2025 -> "FY2024-25"
        start_year = d.year if d.month >= 4 else d.year - 1
        return f"FY{start_year}-{str(start_year + 1)[-2:]}"
    return str(d.year)


def _fifo_holding_period_splits(transactions: List[HoldingTransaction]) -> List[Dict]:
    """One entry per sell, in chronological order (matching
    compute_position's realized_events order): how much of that sell's
    quantity was held for more than one calendar year (long-term) vs not
    (short-term), via FIFO lot matching against buy transactions."""
    lots = []  # [{"date": date, "remaining": float}]
    splits = []

    for t in sorted(transactions, key=lambda t: (t.transaction_date, t.id or 0)):
        if t.transaction_type == "buy":
            lots.append({"date": t.transaction_date, "remaining": t.quantity})
        elif t.transaction_type == "sell":
            remaining_to_sell = t.quantity
            short_term_qty = 0.0
            long_term_qty = 0.0
            for lot in lots:
                if remaining_to_sell <= 0:
                    break
                if lot["remaining"] <= 0:
                    continue
                take = min(lot["remaining"], remaining_to_sell)
                if t.transaction_date > _one_year_later(lot["date"]):
                    long_term_qty += take
                else:
                    short_term_qty += take
                lot["remaining"] -= take
                remaining_to_sell -= take
            splits.append({"short_term_qty": short_term_qty, "long_term_qty": long_term_qty})

    return splits


def estimate_tax_liability(short_term_gain: float, long_term_gain: float, country: str) -> Optional[Dict]:
    rates = TAX_RATES.get(country)
    if not rates:
        return None
    taxable_short_term = max(short_term_gain, 0.0)
    taxable_long_term = max(long_term_gain - rates["long_term_exemption"], 0.0) if long_term_gain > 0 else 0.0
    short_term_tax = taxable_short_term * rates["short_term_rate"]
    long_term_tax = taxable_long_term * rates["long_term_rate"]
    return {
        "short_term_tax": round(short_term_tax, 2),
        "long_term_tax": round(long_term_tax, 2),
        "total_tax": round(short_term_tax + long_term_tax, 2),
    }


def get_tax_summary(user_id=None, household_id=None) -> List[Dict]:
    """Realized gains grouped by (financial year, country), across every
    quantity-based holding the caller can see."""
    if household_id:
        holdings = Holding.query.filter_by(household_id=household_id, is_private=False).all()
    else:
        holdings = Holding.query.filter_by(user_id=user_id).all()

    quantity_holdings = {h.id: h for h in holdings if h.asset_type in QUANTITY_BASED_TYPES}
    if not quantity_holdings:
        return []

    buckets: Dict[tuple, Dict] = {}

    for holding_id, holding in quantity_holdings.items():
        transactions = HoldingTransaction.query.filter_by(holding_id=holding_id).all()
        position = compute_position(transactions)
        holding_period_splits = _fifo_holding_period_splits(transactions)

        for event, split in zip(position["realized_events"], holding_period_splits):
            fy = financial_year_label(event["date"], holding.country)
            key = (fy, holding.country)
            bucket = buckets.setdefault(key, {
                "financial_year": fy,
                "country": holding.country,
                "realized_gain": 0.0,
                "short_term_gain": 0.0,
                "long_term_gain": 0.0,
                "holdings": {},
            })

            per_unit_gain = (event["amount"] / event["quantity"]) if event["quantity"] else 0.0
            short_term_gain = per_unit_gain * split["short_term_qty"]
            long_term_gain = per_unit_gain * split["long_term_qty"]

            bucket["realized_gain"] += event["amount"]
            bucket["short_term_gain"] += short_term_gain
            bucket["long_term_gain"] += long_term_gain
            bucket["holdings"][holding.symbol or holding.name] = (
                bucket["holdings"].get(holding.symbol or holding.name, 0.0) + event["amount"]
            )

    results = []
    for bucket in buckets.values():
        tax_estimate = estimate_tax_liability(bucket["short_term_gain"], bucket["long_term_gain"], bucket["country"])
        results.append({
            "financial_year": bucket["financial_year"],
            "country": bucket["country"],
            "realized_gain": round(bucket["realized_gain"], 2),
            "short_term_gain": round(bucket["short_term_gain"], 2),
            "long_term_gain": round(bucket["long_term_gain"], 2),
            "tax_estimate": tax_estimate,
            "by_holding": [
                {"name": name, "realized_gain": round(gain, 2)}
                for name, gain in bucket["holdings"].items()
            ],
        })

    results.sort(key=lambda r: r["financial_year"], reverse=True)
    return results
