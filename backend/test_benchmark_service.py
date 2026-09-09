"""
Tests for the buy-replay logic that turns real transactions into two
cash-flow series (portfolio vs. benchmark). get_benchmark_comparison
itself needs a database and live price lookups, so it's covered by a live
end-to-end check instead -- see replay_buys_into_cash_flows's docstring
for why this part specifically was split out to be testable without one.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.benchmark_service import replay_buys_into_cash_flows
from backend.models import HoldingTransaction


def _buy(transaction_date, quantity, price_per_unit, currency="USD", fees=0.0):
    return HoldingTransaction(
        holding_id=1,
        user_id="00000000-0000-0000-0000-000000000000",
        transaction_type="buy",
        transaction_date=transaction_date,
        quantity=quantity,
        price_per_unit=price_per_unit,
        currency=currency,
        fees=fees,
    )


def _identity_convert(amount, from_currency, to_currency):
    return amount


def test_all_buys_priced_produces_matching_cash_flow_lists():
    buys = [_buy(date(2024, 1, 1), 10, 100.0), _buy(date(2024, 6, 1), 5, 100.0)]
    result = replay_buys_into_cash_flows(
        buys, "SPY", "USD",
        get_historical_price=lambda *a: 50.0,
        convert=_identity_convert,
    )
    assert result["skipped"] == 0
    assert result["portfolio_cash_flows"] == result["benchmark_cash_flows"]
    assert result["benchmark_units"] == (1000.0 / 50.0) + (500.0 / 50.0)


def test_skipped_buy_excluded_from_benchmark_cash_flows_but_kept_in_portfolio():
    # Regression: a buy whose benchmark price lookup fails used to still
    # count as a benchmark-side outflow with no matching benchmark_units,
    # silently crushing benchmark_xirr toward zero. The fix keeps two
    # separate cash-flow lists instead of one shared one.
    buys = [_buy(date(2024, 1, 1), 10, 100.0), _buy(date(2024, 6, 1), 5, 100.0)]

    def price_lookup(asset_type, symbol, transaction_date, currency):
        return None if transaction_date == date(2024, 6, 1) else 50.0

    result = replay_buys_into_cash_flows(buys, "SPY", "USD", get_historical_price=price_lookup, convert=_identity_convert)

    assert result["skipped"] == 1
    assert len(result["portfolio_cash_flows"]) == 2
    assert len(result["benchmark_cash_flows"]) == 1
    assert result["benchmark_cash_flows"][0][0] == date(2024, 1, 1)
    assert result["benchmark_units"] == 1000.0 / 50.0


def test_no_buys_priced_leaves_empty_benchmark_cash_flows():
    buys = [_buy(date(2024, 1, 1), 10, 100.0)]
    result = replay_buys_into_cash_flows(buys, "SPY", "USD", get_historical_price=lambda *a: None, convert=_identity_convert)
    assert result["skipped"] == 1
    assert result["benchmark_cash_flows"] == []
    assert result["benchmark_units"] == 0.0
    assert len(result["portfolio_cash_flows"]) == 1


def test_fees_included_in_the_outflow_amount():
    buys = [_buy(date(2024, 1, 1), 10, 100.0, fees=5.0)]
    result = replay_buys_into_cash_flows(buys, "SPY", "USD", get_historical_price=lambda *a: 50.0, convert=_identity_convert)
    assert result["portfolio_cash_flows"][0][1] == -1005.0


def test_get_benchmark_comparison_accounts_for_sold_positions():
    """Regression: the portfolio leg's XIRR used to replay buy-only cash
    flows against the *real* (post-sell) current value -- a fully sold
    position (bought low, later sold high, a genuine gain) produced a
    nonsensical XIRR, since the buy outflow had no offsetting inflow at
    all: no sell proceeds counted, and the ending value is correctly $0
    since nothing is held anymore. Now uses holdings_service.portfolio_xirr,
    which includes sells, for the portfolio's own XIRR (the benchmark leg
    stays buy-only, since there's no sensible way to model "sold some
    benchmark too")."""
    from unittest.mock import MagicMock, patch

    from backend import benchmark_service

    holding = MagicMock(asset_type="stock", id=1)
    buy = HoldingTransaction(
        holding_id=1, user_id="u1", transaction_type="buy",
        transaction_date=date(2024, 1, 1), quantity=10, price_per_unit=100.0, currency="USD", fees=0.0,
    )
    sell = HoldingTransaction(
        holding_id=1, user_id="u1", transaction_type="sell",
        transaction_date=date(2025, 1, 1), quantity=10, price_per_unit=200.0, currency="USD", fees=0.0,
    )

    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.all.return_value = [holding]
    mock_tx_query = MagicMock()
    mock_tx_query.filter.return_value.all.return_value = [buy, sell]

    with patch.object(benchmark_service, "Holding") as mock_holding_model, \
         patch.object(benchmark_service, "HoldingTransaction") as mock_tx_model, \
         patch.object(benchmark_service, "price_service") as mock_price_service, \
         patch.object(benchmark_service, "list_holdings_with_metrics", return_value=[]):
        mock_holding_model.query = mock_holding_query
        mock_tx_model.query = mock_tx_query
        mock_tx_model.holding_id.in_ = lambda ids: ids
        mock_price_service.get_historical_price.return_value = 300.0
        mock_price_service.get_current_price.return_value = 400.0
        mock_price_service.convert.side_effect = lambda amount, *_a: amount

        result = benchmark_service.get_benchmark_comparison(user_id="u1")

    assert result is not None
    # Bought for $1000, sold a year later for $2000 -- a real ~100% return.
    assert result["portfolio_xirr"] is not None
    assert result["portfolio_xirr"] > 0.5


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
