"""NSE and BSE symbols resolve to the right Yahoo ticker and the right home currency."""
from backend import price_service as ps


def test_bare_rupee_ticker_is_nse():
    assert ps._with_exchange_suffix("reliance", "INR") == "RELIANCE.NS"


def test_bse_code_and_suffixes():
    assert ps._with_exchange_suffix("500325", "INR") == "500325.BO"
    assert ps._with_exchange_suffix("RELIANCE.BSE", "INR") == "RELIANCE.BO"
    assert ps._with_exchange_suffix("RELIANCE.BO", "INR") == "RELIANCE.BO"
    assert ps._with_exchange_suffix("AAPL", "USD") == "AAPL"
    assert ps._with_exchange_suffix("12345", "INR") == "12345"


def test_bse_listings_are_priced_in_rupees():
    for sym in ("RELIANCE.NS", "RELIANCE.BO", "RELIANCE.BSE", "500325.BO"):
        assert ps.price_home_currency("stock", sym) == "INR"
    assert ps.price_home_currency("stock", "AAPL") == "USD"
