from datetime import date
from unittest.mock import patch

from backend import liability_service as svc
from backend.models import Liability


def _loan(balance, rate, payment, months, next_date, due=None):
    return Liability(
        id=1, user_id="u1", household_id=None, name="Loan", liability_type="mortgage", currency="USD",
        current_balance=balance, interest_rate=rate, monthly_payment=payment, remaining_months=months,
        auto_update=True, next_auto_date=next_date, payment_due_date=due, is_private=False,
    )


def test_emi_matches_known_values():
    assert svc.calculate_emi(200000, 6, 360) == 1199.10
    assert svc.calculate_emi(1200, 0, 12) == 100.0
    assert svc.calculate_emi(0, 5, 12) == 0.0


def test_schedule_first_months_match_hand_calculation():
    rows = svc.amortization_schedule(200000, 6, 1199.10, 360)
    assert [r["balance"] for r in rows[:3]] == [199800.90, 199600.80, 199399.70]
    assert rows[0]["interest"] == 1000.0
    assert rows[0]["principal"] == 199.10
    assert rows[-1]["balance"] == 0.0
    assert len(rows) == 360


def test_schedule_matches_real_lender_after_a_year():
    rows = svc.amortization_schedule(749766.18, 6.75, 4938.61, 300)
    assert rows[11]["balance"] == 740839.26


def test_catch_up_applies_each_missed_month_once():
    loan = _loan(200000.0, 6.0, 1199.10, 360, date(2026, 8, 5))
    with patch.object(svc.db.session, "add"):
        assert svc.catch_up(loan, date(2026, 10, 20)) == 3  # Aug, Sep, Oct
        assert loan.current_balance == 199399.70
        assert loan.remaining_months == 357
        assert loan.next_auto_date == date(2026, 11, 5)
        assert svc.catch_up(loan, date(2026, 10, 20)) == 0  # running again changes nothing
    assert loan.current_balance == 199399.70


def test_catch_up_does_nothing_when_off_or_not_due():
    loan = _loan(1000.0, 5.0, 100.0, 12, date(2026, 12, 1))
    assert svc.catch_up(loan, date(2026, 11, 8)) == 0
    loan.auto_update = False
    loan.next_auto_date = date(2026, 1, 1)
    assert svc.catch_up(loan, date(2026, 11, 8)) == 0


def test_loan_pays_off_and_turns_itself_off():
    loan = _loan(300.0, 12.0, 101.0, 3, date(2026, 1, 31))
    with patch.object(svc.db.session, "add"):
        svc.catch_up(loan, date(2026, 12, 31))
    assert loan.current_balance == 0.0
    assert loan.auto_update is False
    assert loan.next_auto_date is None


def test_month_end_dates_do_not_drift():
    assert svc.add_months(date(2026, 1, 31), 1, 31) == date(2026, 2, 28)
    assert svc.add_months(date(2026, 2, 28), 1, 31) == date(2026, 3, 31)


def test_auto_update_problem_messages():
    loan = _loan(1000.0, None, 100.0, 12, date(2026, 12, 1))
    assert "interest rate" in svc.auto_update_problem(loan)
    loan.interest_rate = 5.0
    loan.remaining_months = 0
    assert "remaining months" in svc.auto_update_problem(loan)
    loan.remaining_months = 12
    loan.monthly_payment = None
    assert "monthly payment" in svc.auto_update_problem(loan)
    loan.monthly_payment = 90.0
    assert svc.auto_update_problem(loan) is None
