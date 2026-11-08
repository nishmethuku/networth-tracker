"""
Liabilities (mortgage, credit card, loans, ...) — subtracted from total
assets to get true net worth. Mirrors holdings_service's shape (a
display-currency-converted view over the raw DB rows) but liabilities
have no transaction ledger or price history: just a balance you update
directly, like a valuation-based holding.
"""
from typing import Dict, List

from . import price_service
from .models import Liability, db

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
    for liability in liabilities:
        d = liability.to_dict()
        d["display_balance"] = round(price_service.convert(liability.current_balance, liability.currency, display_currency), 2)
        results.append(d)
    return results


def total_liabilities_display(liabilities: List[Liability], display_currency: str = "USD") -> float:
    return round(
        sum(price_service.convert(liability.current_balance, liability.currency, display_currency) for liability in liabilities), 2
    )


def apply_payment(liability: Liability, amount: float, amount_currency: str) -> Liability:
    """Reduces a liability's balance by a payment amount (converted into the
    liability's own currency), floored at 0 — used when a Budget expense
    entry is linked to a liability (see create_budget_entry / update_
    budget_entry in app.py), so logging "paid the mortgage" in Budget
    doesn't also require a separate manual edit to the Liability balance.
    Uncommitted -- caller commits alongside the BudgetEntry insert."""
    converted = price_service.convert(amount, amount_currency, liability.currency)
    liability.current_balance = max(0.0, liability.current_balance - converted)
    db.session.add(liability)
    return liability


CHARGEABLE_TYPES = ("credit_card", "line_of_credit")


def apply_charge(liability: Liability, amount: float, amount_currency: str) -> Liability:
    """Raises a liability's balance by a purchase amount (converted into the
    liability's own currency) -- the mirror of apply_payment, used when a
    Budget expense is "paid from" a credit card. Uncommitted; the caller
    commits alongside the BudgetEntry insert."""
    converted = price_service.convert(amount, amount_currency, liability.currency)
    liability.current_balance = liability.current_balance + converted
    db.session.add(liability)
    return liability


def reverse_charge(liability: Liability, amount: float, amount_currency: str) -> Liability:
    """Undoes apply_charge when the purchase is deleted: lowers the balance
    by the amount (converted into the liability's currency), floored at 0."""
    converted = price_service.convert(amount, amount_currency, liability.currency)
    liability.current_balance = max(0.0, liability.current_balance - converted)
    db.session.add(liability)
    return liability


def reverse_payment(liability: Liability, amount: float, amount_currency: str) -> Liability:
    """Undoes apply_payment when the payment entry is deleted: puts the amount
    (converted into the liability's currency) back on the balance."""
    converted = price_service.convert(amount, amount_currency, liability.currency)
    liability.current_balance = liability.current_balance + converted
    db.session.add(liability)
    return liability


def adjust_for_edit(
    liability: Liability,
    old_amount: float,
    old_currency: str,
    new_amount: float,
    new_currency: str,
    kind: str,
) -> Liability:
    """When an expense that moved a liability is edited, applies only the
    difference. kind is "charge" (a purchase on a card: more spending means a
    higher balance) or "payment" (a loan payment: more paid means a lower
    balance). The balance never goes below 0."""
    old_converted = price_service.convert(old_amount, old_currency, liability.currency)
    new_converted = price_service.convert(new_amount, new_currency, liability.currency)
    delta = new_converted - old_converted
    if kind == "payment":
        delta = -delta
    liability.current_balance = max(0.0, liability.current_balance + delta)
    db.session.add(liability)
    return liability


# ---------------------------------------------------------------------------
# Automatic monthly update (the EMI method)
# ---------------------------------------------------------------------------
import calendar  # noqa: E402
from datetime import date  # noqa: E402

MAX_SCHEDULE_MONTHS = 600


def calculate_emi(principal: float, annual_rate_pct: float, months: int) -> float:
    """Standard EMI: P * r * (1+r)^n / ((1+r)^n - 1), r = annual rate / 12.
    A 0% loan is simply principal / months."""
    if months <= 0 or principal <= 0:
        return 0.0
    r = (annual_rate_pct or 0.0) / 100.0 / 12.0
    if r == 0:
        return round(principal / months, 2)
    factor = (1 + r) ** months
    return round(principal * r * factor / (factor - 1), 2)


def add_months(d: date, months: int, anchor_day: int = None) -> date:
    index = d.month - 1 + months
    year, month = d.year + index // 12, index % 12 + 1
    day = min(anchor_day or d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _step(balance: float, annual_rate_pct: float, payment: float, months_left: int):
    """One month: interest first (on the starting balance), then the payment.
    The last month clears whatever is left so rounding never strands cents."""
    interest = round(balance * (annual_rate_pct or 0.0) / 100.0 / 12.0, 2)
    owed = round(balance + interest, 2)
    paid = owed if months_left <= 1 else min(payment, owed)
    return interest, paid, round(owed - paid, 2)


def amortization_schedule(
    balance: float, annual_rate_pct: float, payment: float, months: int, first_date: date = None, anchor_day: int = None
) -> List[Dict]:
    rows = []
    bal = float(balance)
    for i in range(1, min(months, MAX_SCHEDULE_MONTHS) + 1):
        if bal <= 0:
            break
        interest, paid, new_bal = _step(bal, annual_rate_pct, payment, months - i + 1)
        rows.append(
            {
                "month": i,
                "date": add_months(first_date, i - 1, anchor_day).isoformat() if first_date else None,
                "interest": interest,
                "principal": round(paid - interest, 2),
                "payment": paid,
                "balance": new_bal,
            }
        )
        bal = new_bal
    return rows


def auto_update_problem(liability: Liability):
    """Returns why automatic updates cannot be switched on, or None."""
    if liability.interest_rate is None:
        return "Automatic updates need an interest rate"
    if not liability.remaining_months or liability.remaining_months <= 0:
        return "Automatic updates need the remaining months (a whole number above 0)"
    if liability.remaining_months > MAX_SCHEDULE_MONTHS:
        return f"Remaining months cannot be more than {MAX_SCHEDULE_MONTHS}"
    if not liability.monthly_payment or liability.monthly_payment <= 0:
        return "Automatic updates need a monthly payment"
    return None


def catch_up(liability: Liability, today: date = None) -> int:
    """Applies every month that has come due since next_auto_date. Safe to run
    any number of times: each applied month moves next_auto_date forward, so
    nothing is applied twice. Uncommitted; returns the months applied."""
    today = today or date.today()
    if not liability.auto_update or not liability.next_auto_date or auto_update_problem(liability):
        return 0
    anchor = liability.payment_due_date.day if liability.payment_due_date else liability.next_auto_date.day
    applied = 0
    while liability.next_auto_date <= today and liability.current_balance > 0 and liability.remaining_months > 0:
        _, paid, new_bal = _step(
            liability.current_balance, liability.interest_rate, liability.monthly_payment, liability.remaining_months
        )
        liability.current_balance = new_bal
        liability.remaining_months -= 1
        liability.next_auto_date = add_months(liability.next_auto_date, 1, anchor)
        applied += 1
    if liability.current_balance <= 0 or liability.remaining_months <= 0:
        liability.auto_update = False
        liability.next_auto_date = None
        liability.remaining_months = 0 if liability.current_balance <= 0 else liability.remaining_months
    if applied:
        db.session.add(liability)
    return applied


def catch_up_all(today: date = None) -> Dict:
    rows = Liability.query.filter(Liability.auto_update.is_(True)).all()
    months = 0
    touched = 0
    for liability in rows:
        n = catch_up(liability, today)
        if n:
            touched += 1
            months += n
    db.session.commit()
    return {"liabilities_updated": touched, "months_applied": months}
