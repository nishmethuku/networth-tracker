"""
Tax summary financial-year bucketing tests.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import HoldingTransaction
from backend.tax_service import (
    _fifo_holding_period_splits,
    _lot_matched_realized_events,
    _one_year_later,
    estimate_tax_liability,
    financial_year_label,
)


def _tx(transaction_type, transaction_date, quantity, price_per_unit, fees=0.0, tx_id=None):
    t = HoldingTransaction(
        holding_id=1,
        user_id="00000000-0000-0000-0000-000000000000",
        transaction_type=transaction_type,
        transaction_date=transaction_date,
        quantity=quantity,
        price_per_unit=price_per_unit,
        currency="USD",
        fees=fees,
    )
    t.id = tx_id
    return t


def test_india_fy_before_april_belongs_to_previous_fy():
    # Feb 2025 is in FY2024-25 (Apr 2024 - Mar 2025)
    assert financial_year_label(date(2025, 2, 15), "India") == "FY2024-25"


def test_india_fy_on_or_after_april_belongs_to_new_fy():
    assert financial_year_label(date(2024, 4, 1), "India") == "FY2024-25"
    assert financial_year_label(date(2024, 12, 31), "India") == "FY2024-25"


def test_us_uses_calendar_year():
    assert financial_year_label(date(2024, 1, 1), "United States") == "2024"
    assert financial_year_label(date(2024, 12, 31), "United States") == "2024"


def test_one_year_later_leap_day_lands_on_feb_28():
    assert _one_year_later(date(2024, 2, 29)) == date(2025, 2, 28)


def test_one_year_later_ordinary_date():
    assert _one_year_later(date(2024, 6, 1)) == date(2025, 6, 1)


def test_holding_period_split_short_term_on_the_anniversary_itself():
    # "more than one year" is exclusive of the anniversary date -- exactly
    # one year later is still short-term, one day after is long-term.
    txs = [_tx("buy", date(2024, 1, 1), 10, 10.0, tx_id=1), _tx("sell", date(2025, 1, 1), 10, 20.0, tx_id=2)]
    assert _fifo_holding_period_splits(txs) == [{"short_term_qty": 10.0, "long_term_qty": 0.0}]


def test_holding_period_split_long_term_the_day_after_anniversary():
    txs = [_tx("buy", date(2024, 1, 1), 10, 10.0, tx_id=1), _tx("sell", date(2025, 1, 2), 10, 20.0, tx_id=2)]
    assert _fifo_holding_period_splits(txs) == [{"short_term_qty": 0.0, "long_term_qty": 10.0}]


def test_holding_period_split_across_two_lots_of_different_ages():
    # FIFO-consumed for the holding-period split regardless of cost-basis
    # method (see module docstring) -- lot A (long-term by the sell date)
    # gets consumed first, lot B (short-term) makes up the rest.
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 10.0, tx_id=1),  # lot A, long-term by 2024-12-01
        _tx("buy", date(2024, 6, 1), 10, 20.0, tx_id=2),  # lot B, short-term by 2024-12-01
        _tx("sell", date(2024, 12, 1), 15, 30.0, tx_id=3),
    ]
    assert _fifo_holding_period_splits(txs) == [{"short_term_qty": 5.0, "long_term_qty": 10.0}]


def test_fifo_lot_matching_consumes_oldest_lot_first():
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 10.0, tx_id=1),
        _tx("buy", date(2024, 6, 1), 10, 20.0, tx_id=2),
        _tx("sell", date(2024, 12, 1), 15, 30.0, tx_id=3),
    ]
    events, splits = _lot_matched_realized_events(txs, "fifo")
    # (30-10)*10 + (30-20)*5 = 250, all from the 10 oldest units plus 5 of the newer lot
    assert events == [{"date": date(2024, 12, 1), "amount": 250.0, "quantity": 15}]
    assert splits == [{"short_term_qty": 5.0, "long_term_qty": 10.0}]


def test_lifo_lot_matching_consumes_newest_lot_first():
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 10.0, tx_id=1),
        _tx("buy", date(2024, 6, 1), 10, 20.0, tx_id=2),
        _tx("sell", date(2024, 12, 1), 15, 30.0, tx_id=3),
    ]
    events, splits = _lot_matched_realized_events(txs, "lifo")
    # (30-20)*10 + (30-10)*5 = 200, all from the 10 newest units plus 5 of the older lot
    assert events == [{"date": date(2024, 12, 1), "amount": 200.0, "quantity": 15}]
    assert splits == [{"short_term_qty": 10.0, "long_term_qty": 5.0}]


def test_fifo_and_lifo_give_different_gains_from_the_same_transactions():
    # The whole point of offering the choice -- confirm they're not
    # accidentally computing the same thing.
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 10.0, tx_id=1),
        _tx("buy", date(2024, 6, 1), 10, 20.0, tx_id=2),
        _tx("sell", date(2024, 12, 1), 15, 30.0, tx_id=3),
    ]
    fifo_events, _ = _lot_matched_realized_events(txs, "fifo")
    lifo_events, _ = _lot_matched_realized_events(txs, "lifo")
    assert fifo_events[0]["amount"] != lifo_events[0]["amount"]


def test_estimate_tax_liability_applies_long_term_exemption():
    result = estimate_tax_liability(short_term_gain=0.0, long_term_gain=150000.0, country="India")
    # India's long_term_exemption is 100000, so only 50000 is taxable at 10%
    assert result["long_term_tax"] == 5000.0


def test_estimate_tax_liability_ignores_losses():
    result = estimate_tax_liability(short_term_gain=-500.0, long_term_gain=-200.0, country="United States")
    assert result["short_term_tax"] == 0.0
    assert result["long_term_tax"] == 0.0


def test_estimate_tax_liability_unknown_country_returns_none():
    assert estimate_tax_liability(1000.0, 1000.0, "Atlantis") is None


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
