"""
Emergency fund coverage — a classic personal-finance check: how many months
of typical spending your liquid cash could cover if income stopped today.
Deliberately reuses budget_service (average monthly expenses) and
holdings_service (liquid cash value) rather than introducing a third figure
either already tracks; "liquid" is scoped to the cash asset type only —
stocks/mutual funds/deposits could be liquidated too, but not without
either selling at a potentially bad time or waiting out a lock-in, so they
don't count toward the classic definition of an emergency fund.
"""
from typing import Dict

from .budget_service import get_monthly_summary
from .holdings_service import list_holdings_with_metrics
from .models import Holding

LIQUID_ASSET_TYPES = ("cash",)
RECOMMENDED_MONTHS = 6


def get_emergency_fund_status(user_id=None, household_id=None, currency: str = "USD", months: int = 6) -> Dict:
    query = (
        Holding.query.filter_by(household_id=household_id, is_private=False)
        if household_id
        else Holding.query.filter_by(user_id=user_id)
    )
    liquid_holdings = query.filter(Holding.asset_type.in_(LIQUID_ASSET_TYPES)).all()
    metrics = list_holdings_with_metrics(liquid_holdings, display_currency=currency)
    liquid_value = sum(m["display_value"] for m in metrics)

    summary = get_monthly_summary(user_id=user_id, household_id=household_id, months=months, currency=currency)
    month_rows = summary["months"]
    avg_monthly_expenses = (sum(m["expenses"] for m in month_rows) / len(month_rows)) if month_rows else None

    months_covered = None
    if avg_monthly_expenses and avg_monthly_expenses > 0:
        months_covered = round(liquid_value / avg_monthly_expenses, 1)

    return {
        "currency": currency,
        "liquid_value": round(liquid_value, 2),
        "avg_monthly_expenses": round(avg_monthly_expenses, 2) if avg_monthly_expenses else None,
        "months_covered": months_covered,
        "recommended_months": RECOMMENDED_MONTHS,
    }
