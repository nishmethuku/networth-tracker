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

from . import price_service
from .holdings_service import list_holdings_with_metrics
from .models import BudgetEntry, Holding

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

    # Deliberately not budget_service.get_monthly_summary here: that
    # function only sums entries already logged in `currency`, silently
    # excluding the rest (by design, for the Budget page itself -- see its
    # own docstring) rather than converting them. liquid_value above *is*
    # fully converted, so pairing it with a currency-filtered expense
    # figure would divide two numbers computed on different bases -- e.g.
    # $9,600 of converted cash against only the USD-denominated slice of a
    # mostly-INR budget could read as ~19 months covered when the true
    # figure, converting everything, is closer to 4. Expenses are summed
    # and converted directly here instead.
    entry_query = (
        BudgetEntry.query.filter_by(household_id=household_id, is_private=False)
        if household_id
        else BudgetEntry.query.filter_by(user_id=user_id)
    )
    expense_entries = entry_query.filter_by(entry_type="expense").all()
    by_month: Dict[str, float] = {}
    for e in expense_entries:
        key = e.entry_date.strftime("%Y-%m")
        by_month[key] = by_month.get(key, 0.0) + price_service.convert(e.amount, e.currency, currency)
    ordered_months = sorted(by_month.keys())[-months:]
    avg_monthly_expenses = (sum(by_month[m] for m in ordered_months) / len(ordered_months)) if ordered_months else None

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
