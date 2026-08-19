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
    get_monthly_net_flow,
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


def test_monthly_net_flow_buy_is_positive_sell_is_negative():
    holding = _holding(asset_type="stock")
    holding.id = 1
    transactions = [
        _tx("buy", date(2026, 3, 5), 10, 100.0),   # +1000
        _tx("sell", date(2026, 3, 20), 4, 120.0),  # -480
    ]
    result = get_monthly_net_flow([holding], transactions, [])
    assert result == [{"month": "2026-03", "total_flow": 520.0, "by_asset_type": {"stock": 520.0}}]


def test_monthly_net_flow_includes_fees_in_buy_amount():
    holding = _holding(asset_type="stock")
    holding.id = 1
    transactions = [_tx("buy", date(2026, 3, 5), 10, 100.0, fees=5.0)]
    result = get_monthly_net_flow([holding], transactions, [])
    assert result[0]["total_flow"] == 1005.0


def test_monthly_net_flow_valuation_delta_for_real_estate():
    holding = _holding(asset_type="real_estate")
    holding.id = 2
    valuations = [
        HoldingValuation(holding_id=2, user_id=holding.user_id, valuation_date=date(2026, 2, 1), value=400000.0, currency="USD"),
        HoldingValuation(holding_id=2, user_id=holding.user_id, valuation_date=date(2026, 3, 1), value=410000.0, currency="USD"),
    ]
    result = get_monthly_net_flow([holding], [], valuations)
    # Only the delta (Feb -> Mar) counts; the first valuation has no prior point to diff against.
    assert result == [{"month": "2026-03", "total_flow": 10000.0, "by_asset_type": {"real_estate": 10000.0}}]


def test_monthly_net_flow_loan_paydown_is_positive():
    holding = _holding(asset_type="loan")
    holding.id = 3
    valuations = [
        HoldingValuation(holding_id=3, user_id=holding.user_id, valuation_date=date(2026, 2, 1), value=5000.0, currency="USD"),
        HoldingValuation(holding_id=3, user_id=holding.user_id, valuation_date=date(2026, 3, 1), value=4000.0, currency="USD"),
    ]
    result = get_monthly_net_flow([holding], [], valuations)
    # Balance dropped by 1000 -> net worth improved by 1000 -> positive flow.
    assert result[0]["by_asset_type"]["loan"] == 1000.0


def test_monthly_net_flow_loan_increase_is_negative():
    holding = _holding(asset_type="loan")
    holding.id = 4
    valuations = [
        HoldingValuation(holding_id=4, user_id=holding.user_id, valuation_date=date(2026, 2, 1), value=5000.0, currency="USD"),
        HoldingValuation(holding_id=4, user_id=holding.user_id, valuation_date=date(2026, 3, 1), value=6000.0, currency="USD"),
    ]
    result = get_monthly_net_flow([holding], [], valuations)
    assert result[0]["by_asset_type"]["loan"] == -1000.0


def test_monthly_net_flow_groups_multiple_types_in_same_month():
    stock = _holding(asset_type="stock")
    stock.id = 1
    cash = _holding(asset_type="cash")
    cash.id = 5
    transactions = [_tx("buy", date(2026, 3, 5), 10, 100.0)]  # +1000 stock
    valuations = [
        HoldingValuation(holding_id=5, user_id=cash.user_id, valuation_date=date(2026, 2, 1), value=2000.0, currency="USD"),
        HoldingValuation(holding_id=5, user_id=cash.user_id, valuation_date=date(2026, 3, 1), value=2500.0, currency="USD"),  # +500 cash
    ]
    result = get_monthly_net_flow([stock, cash], transactions, valuations)
    assert result[0]["total_flow"] == 1500.0
    assert result[0]["by_asset_type"] == {"stock": 1000.0, "cash": 500.0}


def test_monthly_net_flow_limits_to_trailing_n_months():
    holding = _holding(asset_type="stock")
    holding.id = 1
    transactions = [_tx("buy", date(2026, m, 1), 1, 100.0) for m in range(1, 7)]
    result = get_monthly_net_flow([holding], transactions, [], months=3)
    assert [r["month"] for r in result] == ["2026-04", "2026-05", "2026-06"]


def test_monthly_net_flow_empty_without_activity():
    assert get_monthly_net_flow([], [], []) == []


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
