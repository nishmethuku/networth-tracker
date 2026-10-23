from unittest.mock import patch

from backend import liability_service
from backend.models import Liability


def _liability(balance=1000.0, currency="USD"):
    return Liability(
        id=1, user_id="u1", household_id=None, name="Test Loan", liability_type="personal_loan",
        currency=currency, current_balance=balance, original_amount=None, interest_rate=None,
        notes=None, is_private=False,
    )


def test_apply_payment_reduces_balance_same_currency():
    liability = _liability(balance=1000.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.apply_payment(liability, 200.0, "USD")
    assert liability.current_balance == 800.0


def test_apply_payment_converts_currency():
    liability = _liability(balance=1000.0, currency="USD")
    with patch.object(liability_service, "price_service") as mock_price_service, \
         patch.object(liability_service.db.session, "add"):
        mock_price_service.convert.return_value = 12.0  # e.g. 1000 INR -> $12
        liability_service.apply_payment(liability, 1000.0, "INR")
        mock_price_service.convert.assert_called_once_with(1000.0, "INR", "USD")
    assert liability.current_balance == 988.0


def test_apply_payment_floors_at_zero_not_negative():
    liability = _liability(balance=100.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.apply_payment(liability, 500.0, "USD")
    assert liability.current_balance == 0.0


def test_apply_charge_raises_balance_and_converts_currency():
    liability = _liability(balance=100.0, currency="USD")
    with patch.object(liability_service, "price_service") as mock_price_service, \
         patch.object(liability_service.db.session, "add"):
        mock_price_service.convert.return_value = 12.0
        liability_service.apply_charge(liability, 1000.0, "INR")
        mock_price_service.convert.assert_called_once_with(1000.0, "INR", "USD")
    assert liability.current_balance == 112.0


def test_only_cards_and_credit_lines_are_chargeable():
    assert "credit_card" in liability_service.CHARGEABLE_TYPES
    assert "mortgage" not in liability_service.CHARGEABLE_TYPES


def test_card_types_match_the_frontend_split_between_charge_and_pays_down():
    # Budget "Paid from" lists these as chargeable and "Pays down" must exclude them,
    # otherwise a card bill logged as an expense is counted as spending twice.
    assert set(liability_service.CHARGEABLE_TYPES) == {"credit_card", "line_of_credit"}


def test_reverse_charge_lowers_balance_and_floors_at_zero():
    liability = _liability(balance=100.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.reverse_charge(liability, 30.0, "USD")
        assert liability.current_balance == 70.0
        liability_service.reverse_charge(liability, 500.0, "USD")
    assert liability.current_balance == 0.0


def test_reverse_charge_converts_currency():
    liability = _liability(balance=100.0, currency="USD")
    with patch.object(liability_service, "price_service") as mock_price_service, \
         patch.object(liability_service.db.session, "add"):
        mock_price_service.convert.return_value = 12.0
        liability_service.reverse_charge(liability, 1000.0, "INR")
        mock_price_service.convert.assert_called_once_with(1000.0, "INR", "USD")
    assert liability.current_balance == 88.0


def test_reverse_payment_puts_the_amount_back():
    liability = _liability(balance=800.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.reverse_payment(liability, 200.0, "USD")
    assert liability.current_balance == 1000.0


def test_adjust_for_edit_charge_applies_only_the_difference():
    card = _liability(balance=500.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.adjust_for_edit(card, 50.0, "USD", 80.0, "USD", "charge")
        assert card.current_balance == 530.0
        liability_service.adjust_for_edit(card, 80.0, "USD", 20.0, "USD", "charge")
    assert card.current_balance == 470.0


def test_adjust_for_edit_payment_goes_the_other_way_and_floors_at_zero():
    loan = _liability(balance=1000.0, currency="USD")
    with patch.object(liability_service.db.session, "add"):
        liability_service.adjust_for_edit(loan, 200.0, "USD", 300.0, "USD", "payment")
        assert loan.current_balance == 900.0
        liability_service.adjust_for_edit(loan, 300.0, "USD", 5000.0, "USD", "payment")
    assert loan.current_balance == 0.0


def test_adjust_for_edit_handles_a_currency_change():
    card = _liability(balance=100.0, currency="USD")
    with patch.object(liability_service, "price_service") as ps, patch.object(liability_service.db.session, "add"):
        ps.convert.side_effect = lambda amt, frm, to: amt if frm == to else amt * 0.012
        liability_service.adjust_for_edit(card, 10.0, "USD", 1000.0, "INR", "charge")
    assert card.current_balance == 102.0
