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
