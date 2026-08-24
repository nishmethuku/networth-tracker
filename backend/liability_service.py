"""
Liabilities (mortgage, credit card, loans, ...) — subtracted from total
assets to get true net worth. Mirrors holdings_service's shape (a
display-currency-converted view over the raw DB rows) but liabilities
have no transaction ledger or price history: just a balance you update
directly, like a valuation-based holding.
"""
from typing import Dict, List

from . import price_service
from .models import Liability

LIABILITY_TYPES = (
    "mortgage",
    "credit_card",
    "auto_loan",
    "student_loan",
    "personal_loan",
    "line_of_credit",
    "other",
)


def list_liabilities_with_display(liabilities: List[Liability], display_currency: str = "USD") -> List[Dict]:
    results = []
    for l in liabilities:
        d = l.to_dict()
        d["display_balance"] = round(price_service.convert(l.current_balance, l.currency, display_currency), 2)
        results.append(d)
    return results


def total_liabilities_display(liabilities: List[Liability], display_currency: str = "USD") -> float:
    return round(
        sum(price_service.convert(l.current_balance, l.currency, display_currency) for l in liabilities), 2
    )
