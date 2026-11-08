from unittest.mock import patch

from backend import utils


def setup_function():
    utils._PRICE_CACHE.clear()


def test_gold_uses_free_yahoo_price_without_a_key():
    with patch.object(utils, "METALS_API_KEY", None), \
         patch.object(utils, "get_historical_price_from_yahoo", return_value=2650.0) as y:
        assert utils.get_metal_price("gold", "USD") == 2650.0
    assert y.call_args[0][0] == "GC=F"


def test_price_is_converted_to_the_requested_currency():
    with patch.object(utils, "METALS_API_KEY", None), \
         patch.object(utils, "get_historical_price_from_yahoo", return_value=2000.0), \
         patch.object(utils, "get_exchange_rate", return_value=84.0):
        assert utils.get_metal_price("silver", "INR") == 168000.0


def test_unknown_metal_or_failed_lookup_gives_none():
    with patch.object(utils, "METALS_API_KEY", None), \
         patch.object(utils, "get_historical_price_from_yahoo", return_value=None):
        assert utils.get_metal_price("gold", "USD") is None
        assert utils.get_metal_price("copper", "USD") is None


def test_metals_are_not_priced_live_or_historically():
    from datetime import date

    from backend import price_service

    with patch.object(utils, "requests") as net:
        assert price_service.get_current_price("commodity", "gold", "INR") is None
        assert price_service.get_historical_price("commodity", "gold", date(2026, 1, 1), "INR") is None
        net.get.assert_not_called()


def test_a_metal_holding_is_valued_at_the_price_entered():
    from datetime import date

    from backend.holdings_service import calculate_holding_metrics
    from backend.models import Holding, HoldingTransaction

    holding = Holding(id=1, user_id="u", asset_type="commodity", symbol="gold", name="Gold", country="India", account="", currency="INR")
    tx = HoldingTransaction(
        holding_id=1, user_id="u", transaction_type="buy", transaction_date=date(2026, 10, 25), quantity=1, price_per_unit=21250000, fees=0
    )
    m = calculate_holding_metrics(holding, [tx], current_price=None)
    assert m["current_value"] == 21250000
    assert m["unrealized_gain"] == 0
