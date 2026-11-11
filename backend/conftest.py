import pytest


@pytest.fixture(autouse=True)
def _clear_price_miss_cache():
    """Failed price lookups are remembered in memory; keep that from leaking between tests."""
    from backend import price_service

    price_service._historical_misses.clear()
    yield
    price_service._historical_misses.clear()
