"""
Correctness tests for the transaction-based calc engine: average cost basis,
realized/unrealized gains, XIRR, and non-tradeable valuation metrics.
"""
import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.finance import xirr
from backend.holdings_service import (
    compute_position,
    calculate_holding_metrics,
    calculate_valuation_metrics,
)
from backend.models import Holding, HoldingTransaction, HoldingValuation


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


def _holding(asset_type="stock"):
    return Holding(
        user_id="00000000-0000-0000-0000-000000000000",
        asset_type=asset_type,
        symbol="AAPL",
        name="AAPL",
        country="United States",
        account="Test",
        currency="USD",
    )


def test_average_cost_single_buy():
    txs = [_tx("buy", date(2024, 1, 1), 10, 100.0)]
    pos = compute_position(txs)
    assert pos["quantity"] == 10
    assert pos["avg_cost"] == 100.0
    assert pos["cost_basis"] == 1000.0
    assert pos["realized_gain"] == 0.0


def test_average_cost_two_buys_averages_correctly():
    # 10 @ 100 + 10 @ 200 -> 20 units @ avg cost 150
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("buy", date(2024, 6, 1), 10, 200.0),
    ]
    pos = compute_position(txs)
    assert pos["quantity"] == 20
    assert abs(pos["avg_cost"] - 150.0) < 1e-9
    assert pos["cost_basis"] == 3000.0


def test_sell_books_realized_gain_at_avg_cost():
    # Buy 10 @ 100 (cost basis 1000, avg cost 100), sell 5 @ 150
    # Realized gain = (150 - 100) * 5 = 250; remaining 5 units still @ avg cost 100
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("sell", date(2024, 6, 1), 5, 150.0),
    ]
    pos = compute_position(txs)
    assert pos["quantity"] == 5
    assert abs(pos["avg_cost"] - 100.0) < 1e-9
    assert abs(pos["realized_gain"] - 250.0) < 1e-9
    assert abs(pos["cost_basis"] - 500.0) < 1e-9


def test_sell_deducts_fees_from_realized_gain():
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("sell", date(2024, 6, 1), 10, 150.0, fees=20.0),
    ]
    pos = compute_position(txs)
    # (150-100)*10 - 20 fee = 480
    assert abs(pos["realized_gain"] - 480.0) < 1e-9


def test_holding_metrics_unrealized_gain_with_live_price():
    holding = _holding()
    txs = [_tx("buy", date.today() - timedelta(days=365), 10, 100.0)]
    metrics = calculate_holding_metrics(holding, txs, current_price=120.0)
    assert metrics["quantity"] == 10
    assert abs(metrics["unrealized_gain"] - 200.0) < 1e-9
    assert abs(metrics["current_value"] - 1200.0) < 1e-9
    # ~20% return over ~1 year -> xirr should be close to 0.20
    assert metrics["xirr"] is not None
    assert abs(metrics["xirr"] - 0.20) < 0.02


def test_holding_metrics_falls_back_to_avg_cost_without_live_price():
    holding = _holding()
    txs = [_tx("buy", date.today() - timedelta(days=100), 10, 100.0)]
    metrics = calculate_holding_metrics(holding, txs, current_price=None)
    assert metrics["current_value"] == 1000.0
    assert metrics["unrealized_gain"] == 0.0


def test_xirr_doubling_in_one_year_is_about_100_percent():
    flows = [
        (date(2023, 1, 1), -1000.0),
        (date(2024, 1, 1), 2000.0),
    ]
    rate = xirr(flows)
    assert rate is not None
    assert abs(rate - 1.0) < 0.02


def test_xirr_requires_both_inflow_and_outflow():
    assert xirr([(date(2023, 1, 1), -1000.0), (date(2024, 1, 1), -500.0)]) is None
    assert xirr([(date(2023, 1, 1), 1000.0)]) is None


def test_valuation_metrics_real_estate_gain():
    holding = _holding(asset_type="real_estate")
    valuations = [
        HoldingValuation(holding_id=1, user_id=holding.user_id, valuation_date=date(2023, 1, 1), value=200000.0, currency="USD"),
        HoldingValuation(holding_id=1, user_id=holding.user_id, valuation_date=date(2024, 1, 1), value=220000.0, currency="USD"),
    ]
    metrics = calculate_valuation_metrics(holding, valuations)
    assert metrics["current_value"] == 220000.0
    assert metrics["gain"] == 20000.0


def test_valuation_metrics_loan_is_negative():
    holding = _holding(asset_type="loan")
    valuations = [
        HoldingValuation(holding_id=1, user_id=holding.user_id, valuation_date=date(2024, 1, 1), value=5000.0, currency="USD"),
    ]
    metrics = calculate_valuation_metrics(holding, valuations)
    assert metrics["current_value"] == -5000.0


def test_valuation_metrics_empty_history():
    holding = _holding(asset_type="cash")
    metrics = calculate_valuation_metrics(holding, [])
    assert metrics["current_value"] == 0.0
    assert metrics["history"] == []


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
