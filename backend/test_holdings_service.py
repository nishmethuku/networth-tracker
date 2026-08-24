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
    build_dashboard,
    build_funding_valuation,
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


def test_dividend_does_not_change_quantity_or_cost_basis():
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("dividend", date(2024, 6, 1), 1, 25.0),
    ]
    pos = compute_position(txs)
    assert pos["quantity"] == 10
    assert pos["cost_basis"] == 1000.0
    assert pos["avg_cost"] == 100.0
    assert pos["income_received"] == 25.0


def test_interest_accumulates_alongside_dividends():
    txs = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("dividend", date(2024, 3, 1), 1, 10.0),
        _tx("interest", date(2024, 9, 1), 1, 5.0),
    ]
    pos = compute_position(txs)
    assert pos["income_received"] == 15.0


def test_dividend_fees_reduce_income_received():
    txs = [_tx("dividend", date(2024, 3, 1), 1, 25.0, fees=2.0)]
    pos = compute_position(txs)
    assert pos["income_received"] == 23.0


def test_holding_metrics_exposes_income_received():
    holding = _holding()
    txs = [
        _tx("buy", date.today() - timedelta(days=200), 10, 100.0),
        _tx("dividend", date.today() - timedelta(days=100), 1, 15.0),
    ]
    metrics = calculate_holding_metrics(holding, txs, current_price=110.0)
    assert metrics["income_received"] == 15.0
    # Dividend income counts as a real XIRR inflow, same direction as a sell.
    assert metrics["xirr"] is not None


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


def test_monthly_net_flow_dividend_is_positive_not_a_withdrawal():
    holding = _holding(asset_type="stock")
    holding.id = 1
    transactions = [
        _tx("buy", date(2026, 3, 5), 10, 100.0),      # +1000
        _tx("dividend", date(2026, 3, 20), 1, 25.0),  # +25, not -25
    ]
    result = get_monthly_net_flow([holding], transactions, [])
    assert result == [{"month": "2026-03", "total_flow": 1025.0, "by_asset_type": {"stock": 1025.0}}]


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


def test_build_dashboard_omits_portfolio_xirr_without_transactions():
    holding = _holding(asset_type="stock")
    holding.id = 1
    metrics = [{"id": 1, "asset_type": "stock", "country": "United States", "currency": "USD", "display_value": 1000.0, "quantity": 0}]
    result = build_dashboard(metrics, {1: holding})
    assert result["portfolio_xirr"] is None


def test_build_dashboard_computes_portfolio_xirr_from_transactions():
    holding = _holding(asset_type="stock")
    holding.id = 1
    # quantity omitted (defaults to 0 via .get in build_dashboard) so the "this month mover"
    # lookup — which needs a live historical-price call — is skipped; irrelevant to this test.
    metrics = [{"id": 1, "asset_type": "stock", "country": "United States", "currency": "USD", "display_value": 2000.0}]
    transactions = [_tx("buy", date.today() - timedelta(days=365), 10, 100.0)]  # bought for 1000, worth 2000 a year later
    result = build_dashboard(metrics, {1: holding}, all_transactions=transactions)
    assert result["portfolio_xirr"] is not None
    assert result["portfolio_xirr"] > 0.9  # doubled in ~1 year -> XIRR near 100%


def test_build_dashboard_ignores_valuation_based_holdings_for_portfolio_xirr():
    holding = _holding(asset_type="real_estate")
    holding.id = 1
    metrics = [{"id": 1, "asset_type": "real_estate", "country": "United States", "currency": "USD", "display_value": 500000.0}]
    # No transactions at all for a valuation-based holding (it wouldn't have any) -> no XIRR to compute.
    result = build_dashboard(metrics, {1: holding}, all_transactions=[])
    assert result["portfolio_xirr"] is None


def test_build_funding_valuation_deducts_cost_from_latest_cash_balance():
    cash = _holding(asset_type="cash")
    cash.id = 9
    valuations = [HoldingValuation(holding_id=9, user_id=cash.user_id, valuation_date=date(2026, 1, 1), value=5000.0, currency="USD")]
    val = build_funding_valuation(cash, valuations, amount=1200.0, amount_currency="USD", on_date=date(2026, 2, 1), acting_user_id=cash.user_id)
    assert val.value == 3800.0
    assert val.currency == "USD"
    assert val.holding_id == 9


def test_build_funding_valuation_converts_currency():
    from unittest.mock import patch

    cash = _holding(asset_type="cash")
    cash.id = 9
    cash.currency = "USD"
    valuations = [HoldingValuation(holding_id=9, user_id=cash.user_id, valuation_date=date(2026, 1, 1), value=1000.0, currency="USD")]
    # Spending an INR amount out of a USD cash balance should convert first, not subtract raw INR from raw USD.
    with patch("backend.holdings_service.price_service.convert", return_value=10.0) as mock_convert:
        val = build_funding_valuation(cash, valuations, amount=830.0, amount_currency="INR", on_date=date(2026, 2, 1), acting_user_id=cash.user_id)
    mock_convert.assert_called_once_with(830.0, "INR", "USD")
    assert val.value == 990.0


def test_build_funding_valuation_rejects_non_cash_source():
    stock = _holding(asset_type="stock")
    stock.id = 1
    import pytest
    with pytest.raises(ValueError):
        build_funding_valuation(stock, [], amount=100.0, amount_currency="USD", on_date=date(2026, 2, 1), acting_user_id=stock.user_id)


def test_build_funding_valuation_rejects_cash_with_no_history():
    cash = _holding(asset_type="cash")
    cash.id = 9
    import pytest
    with pytest.raises(ValueError):
        build_funding_valuation(cash, [], amount=100.0, amount_currency="USD", on_date=date(2026, 2, 1), acting_user_id=cash.user_id)


def test_build_dashboard_sums_display_currency_gains_not_native_currency():
    """A USD holding and an INR holding must have their gains converted to
    the same display currency before being added together — summing the
    raw native-currency figures would silently add mismatched currencies."""
    usd_holding = _holding(asset_type="stock")
    usd_holding.id = 1
    inr_holding = _holding(asset_type="stock")
    inr_holding.id = 2
    inr_holding.currency = "INR"

    metrics = [
        {
            "id": 1, "asset_type": "stock", "country": "United States", "currency": "USD", "display_value": 1000.0,
            "realized_gain": 100.0, "display_realized_gain": 100.0,  # USD -> USD, no conversion
            "unrealized_gain": 50.0, "display_unrealized_gain": 50.0,
        },
        {
            "id": 2, "asset_type": "stock", "country": "India", "currency": "INR", "display_value": 500.0,
            # 8300 INR realized gain converts to 100 USD at an ~83 rate — if
            # the aggregation used the raw "realized_gain" (8300) instead of
            # "display_realized_gain" (100), the total would be wildly off.
            "realized_gain": 8300.0, "display_realized_gain": 100.0,
            "unrealized_gain": 4150.0, "display_unrealized_gain": 50.0,
        },
    ]
    result = build_dashboard(metrics, {1: usd_holding, 2: inr_holding})
    assert result["realized_gain"] == 200.0
    assert result["unrealized_gain"] == 100.0


def test_build_dashboard_subtracts_liabilities_from_net_worth_but_not_assets():
    """total_net_worth must be assets minus liabilities, but allocation_by_*
    (used as a rebalance-percentage denominator via total_assets) stays
    asset-only — debt isn't part of "how your assets are allocated"."""
    holding = _holding(asset_type="stock")
    holding.id = 1
    metrics = [{"id": 1, "asset_type": "stock", "country": "United States", "currency": "USD", "display_value": 1000.0}]
    result = build_dashboard(metrics, {1: holding}, total_liabilities=300.0)
    assert result["total_assets"] == 1000.0
    assert result["total_liabilities"] == 300.0
    assert result["total_net_worth"] == 700.0
    assert sum(a["value"] for a in result["allocation_by_type"]) == 1000.0


def test_build_dashboard_groups_allocation_by_currency():
    usd_holding = _holding(asset_type="stock")
    usd_holding.id = 1
    inr_holding = _holding(asset_type="stock")
    inr_holding.id = 2
    inr_holding.currency = "INR"
    metrics = [
        {"id": 1, "asset_type": "stock", "country": "United States", "currency": "USD", "display_value": 1000.0},
        {"id": 2, "asset_type": "stock", "country": "India", "currency": "INR", "display_value": 500.0},
    ]
    result = build_dashboard(metrics, {1: usd_holding, 2: inr_holding})
    by_currency = {a["label"]: a["value"] for a in result["allocation_by_currency"]}
    assert by_currency == {"USD": 1000.0, "INR": 500.0}


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
