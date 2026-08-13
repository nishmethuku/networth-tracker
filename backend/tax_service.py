"""
Realized gains grouped by financial year, for tax-season reference.
India uses Apr 1–Mar 31; everything else uses the calendar year.
"""
from datetime import date
from typing import Dict, List

from .holdings_service import compute_position, QUANTITY_BASED_TYPES
from .models import Holding, HoldingTransaction


def financial_year_label(d: date, country: str) -> str:
    if country == "India":
        # e.g. Nov 2024 -> "FY2024-25", Feb 2025 -> "FY2024-25"
        start_year = d.year if d.month >= 4 else d.year - 1
        return f"FY{start_year}-{str(start_year + 1)[-2:]}"
    return str(d.year)


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

        for event in position["realized_events"]:
            fy = financial_year_label(event["date"], holding.country)
            key = (fy, holding.country)
            bucket = buckets.setdefault(key, {
                "financial_year": fy,
                "country": holding.country,
                "realized_gain": 0.0,
                "holdings": {},
            })
            bucket["realized_gain"] += event["amount"]
            bucket["holdings"][holding.symbol or holding.name] = (
                bucket["holdings"].get(holding.symbol or holding.name, 0.0) + event["amount"]
            )

    results = []
    for bucket in buckets.values():
        results.append({
            "financial_year": bucket["financial_year"],
            "country": bucket["country"],
            "realized_gain": round(bucket["realized_gain"], 2),
            "by_holding": [
                {"name": name, "realized_gain": round(gain, 2)}
                for name, gain in bucket["holdings"].items()
            ],
        })

    results.sort(key=lambda r: r["financial_year"], reverse=True)
    return results
