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


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
