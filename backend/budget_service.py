"""
Income/expense (Budget) aggregation. Deliberately independent of
holdings_service — this never touches net worth, so there's no
double-counting risk between "money you logged as spent" and "a cash
holding you track separately."
"""
from datetime import date
from typing import Dict, List, Optional

from .models import db, BudgetEntry

INCOME_CATEGORIES = ["paycheck", "bonus", "interest", "gift", "other_income"]
EXPENSE_CATEGORIES = [
    "housing", "food", "transport", "utilities", "healthcare",
    "entertainment", "shopping", "education", "insurance", "other_expense",
]


def _scoped_query(user_id=None, household_id=None):
    if household_id:
        return BudgetEntry.query.filter_by(household_id=household_id, is_private=False)
    return BudgetEntry.query.filter_by(user_id=user_id)


def get_monthly_summary(user_id=None, household_id=None, months: int = 6, currency: str = "USD") -> Dict:
    """Income/expense/net per month for the trailing `months`, plus a
    category breakdown for the most recent month with any activity.
    Only sums entries in `currency` — entries logged in a different
    currency are reported separately in `other_currency_entries` rather
    than silently mixed into the total."""
    entries = _scoped_query(user_id, household_id).order_by(BudgetEntry.entry_date.asc()).all()
    return summarize_entries(entries, months=months, currency=currency)


def summarize_entries(entries: List[BudgetEntry], months: int = 6, currency: str = "USD") -> Dict:
    """Pure aggregation over an already-fetched list of entries — split out
    from get_monthly_summary so it's testable without a real database."""
    matching = [e for e in entries if e.currency == currency]
    other_currency_count = len(entries) - len(matching)

    by_month: Dict[str, Dict] = {}
    for e in matching:
        key = e.entry_date.strftime("%Y-%m")
        bucket = by_month.setdefault(key, {"month": key, "income": 0.0, "expenses": 0.0})
        if e.entry_type == "income":
            bucket["income"] += e.amount
        else:
            bucket["expenses"] += e.amount

    ordered_months = sorted(by_month.keys())[-months:]
    month_rows = []
    for key in ordered_months:
        bucket = by_month[key]
        month_rows.append({
            "month": bucket["month"],
            "income": round(bucket["income"], 2),
            "expenses": round(bucket["expenses"], 2),
            "net": round(bucket["income"] - bucket["expenses"], 2),
        })

    latest_month = ordered_months[-1] if ordered_months else None
    category_breakdown = []
    if latest_month:
        by_category: Dict[str, float] = {}
        for e in matching:
            if e.entry_date.strftime("%Y-%m") != latest_month or e.entry_type != "expense":
                continue
            by_category[e.category] = by_category.get(e.category, 0.0) + e.amount
        category_breakdown = sorted(
            [{"category": k, "amount": round(v, 2)} for k, v in by_category.items()],
            key=lambda c: -c["amount"],
        )

    return {
        "currency": currency,
        "months": month_rows,
        "latest_month": latest_month,
        "category_breakdown": category_breakdown,
        "other_currency_entries": other_currency_count,
    }
