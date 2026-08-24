"""
Short-term/long-term classification and tax liability estimate tests.
"""
import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.tax_service import _fifo_holding_period_splits, estimate_tax_liability
from backend.models import HoldingTransaction


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


def test_sell_after_over_a_year_is_long_term():
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 100.0, tx_id=1),
        _tx("sell", date(2024, 2, 1), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 0.0, "long_term_qty": 10.0}]


def test_sell_within_a_year_is_short_term():
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0, tx_id=1),
        _tx("sell", date(2024, 6, 1), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 10.0, "long_term_qty": 0.0}]


def test_sell_exactly_one_calendar_year_later_is_short_term():
    # Held for exactly one year to the day -> not "more than one year" -> short-term.
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 100.0, tx_id=1),
        _tx("sell", date(2024, 1, 1), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 10.0, "long_term_qty": 0.0}]


def test_sell_one_calendar_year_and_a_day_later_is_long_term():
    txs = [
        _tx("buy", date(2023, 1, 1), 10, 100.0, tx_id=1),
        _tx("sell", date(2024, 1, 2), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 0.0, "long_term_qty": 10.0}]


def test_leap_day_in_holding_period_does_not_inflate_to_long_term():
    # 2024 is a leap year, so 2024-01-01 -> 2025-01-01 is 366 raw days but
    # still exactly one calendar year -> must stay short-term. A flat
    # 365-day cutoff would wrongly call this long-term.
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0, tx_id=1),
        _tx("sell", date(2025, 1, 1), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 10.0, "long_term_qty": 0.0}]


def test_bought_on_leap_day_uses_feb_28_anniversary():
    txs = [
        _tx("buy", date(2024, 2, 29), 10, 100.0, tx_id=1),
        _tx("sell", date(2025, 2, 28), 10, 150.0, tx_id=2),
    ]
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 10.0, "long_term_qty": 0.0}]

    txs[1] = _tx("sell", date(2025, 3, 1), 10, 150.0, tx_id=2)
    splits = _fifo_holding_period_splits(txs)
    assert splits == [{"short_term_qty": 0.0, "long_term_qty": 10.0}]


def test_fifo_splits_a_sell_across_lots_of_different_ages():
    # Old lot (long-term by sell time) + recent lot (short-term)
    txs = [
        _tx("buy", date(2022, 1, 1), 5, 100.0, tx_id=1),
        _tx("buy", date(2024, 1, 1), 5, 120.0, tx_id=2),
        _tx("sell", date(2024, 6, 1), 8, 150.0, tx_id=3),
    ]
    splits = _fifo_holding_period_splits(txs)
    # FIFO consumes the 2022 lot (5, long-term) first, then 3 from the 2024 lot (short-term)
    assert splits == [{"short_term_qty": 3.0, "long_term_qty": 5.0}]


def test_estimate_tax_liability_india_applies_lt_exemption():
    result = estimate_tax_liability(short_term_gain=100000, long_term_gain=150000, country="India")
    # LT taxable = 150000 - 100000 exemption = 50000 @ 10% = 5000
    # ST = 100000 @ 15% = 15000
    assert result["short_term_tax"] == 15000.0
    assert result["long_term_tax"] == 5000.0
    assert result["total_tax"] == 20000.0


def test_estimate_tax_liability_ignores_net_losses():
    result = estimate_tax_liability(short_term_gain=-5000, long_term_gain=-2000, country="United States")
    assert result["short_term_tax"] == 0.0
    assert result["long_term_tax"] == 0.0


def test_estimate_tax_liability_unknown_country_returns_none():
    assert estimate_tax_liability(1000, 1000, "Narnia") is None


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
