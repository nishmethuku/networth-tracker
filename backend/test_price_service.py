"""
Tests for price_service's DB-cache layer: currency-scoped cache keys and
graceful handling of a concurrent-insert race.
"""
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.exc import IntegrityError

from backend import price_service


def test_cache_price_looks_up_by_currency_too():
    """Regression: _cache_price previously looked up an existing row by
    (asset_type, symbol, price_date) only, then overwrote its currency --
    so caching a crypto price in INR after it was already cached in USD
    for the same symbol/day silently replaced the USD row instead of
    keeping both. The lookup (and the unique constraint it relies on,
    see migration 12cb548a4a40) must include currency."""
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None

    with patch.object(price_service, "PriceHistory") as mock_model, patch.object(price_service, "db") as mock_db:
        mock_model.query = mock_query
        price_service._cache_price("crypto", "bitcoin", date(2026, 1, 1), 5000000.0, "INR", "coingecko")

    mock_query.filter_by.assert_called_once_with(
        asset_type="crypto", symbol="bitcoin", price_date=date(2026, 1, 1), currency="INR"
    )
    mock_db.session.add.assert_called_once()


def test_cache_price_updates_existing_row_for_same_currency_without_touching_currency_field():
    existing = MagicMock(price=100.0, source="yahoo")
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = existing

    with patch.object(price_service, "PriceHistory") as mock_model, patch.object(price_service, "db") as mock_db:
        mock_model.query = mock_query
        price_service._cache_price("stock", "AAPL", date(2026, 1, 1), 110.0, "USD", "yahoo")

    assert existing.price == 110.0
    mock_db.session.add.assert_not_called()
    mock_db.session.commit.assert_called_once()


def test_cache_price_rolls_back_on_concurrent_insert_race():
    """Regression: a bare insert-then-commit with no exception handling
    meant a concurrent duplicate insert (same symbol/day/currency cached
    by two requests at once) raised IntegrityError and left the SQLAlchemy
    session poisoned for the rest of that request -- every later query in
    the same request would fail too, since nothing ever called rollback()."""
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None

    with patch.object(price_service, "PriceHistory") as mock_model, patch.object(price_service, "db") as mock_db:
        mock_model.query = mock_query
        mock_db.session.commit.side_effect = IntegrityError("stmt", {}, Exception("duplicate key"))
        price_service._cache_price("crypto", "bitcoin", date(2026, 1, 1), 60000.0, "USD", "coingecko")

    mock_db.session.rollback.assert_called_once()


def test_get_historical_price_cache_lookup_includes_currency():
    """Same collision as _cache_price, on the read side: a cached USD price
    for a symbol/day must not be served back for an INR request."""
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None

    with patch.object(price_service, "PriceHistory") as mock_model, \
         patch.object(price_service, "get_historical_price_from_yahoo", return_value=None):
        mock_model.query = mock_query
        price_service.get_historical_price("stock", "AAPL", date(2026, 1, 1), currency="INR")

    mock_query.filter_by.assert_called_once_with(
        asset_type="stock", symbol="AAPL", price_date=date(2026, 1, 1), currency="INR"
    )


def test_get_rate_rolls_back_on_concurrent_insert_race():
    mock_query = MagicMock()
    mock_query.filter_by.return_value.first.return_value = None

    with patch.object(price_service, "ExchangeRate") as mock_model, \
         patch.object(price_service, "db") as mock_db, \
         patch.object(price_service, "_fetch_exchange_rate", return_value=83.0):
        mock_model.query = mock_query
        mock_db.session.commit.side_effect = IntegrityError("stmt", {}, Exception("duplicate key"))
        rate = price_service.get_rate("USD", "INR")

    assert rate == 83.0
    mock_db.session.rollback.assert_called_once()


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
