import pytest


@pytest.fixture(autouse=True)
def _clear_price_miss_cache():
    """Failed price lookups are remembered in memory; keep that from leaking between tests."""
    from backend import price_service

    price_service._historical_misses.clear()
    yield
    price_service._historical_misses.clear()


@pytest.fixture(autouse=True)
def _xirr_on_for_tests(monkeypatch):
    """XIRR is switched off in production for now; the tests still exercise the real maths."""
    from backend import benchmark_service, holdings_service

    monkeypatch.setattr(holdings_service, "XIRR_ENABLED", True)
    monkeypatch.setattr(benchmark_service, "XIRR_ENABLED", True)


@pytest.fixture(autouse=True)
def _no_stored_prices_by_default(monkeypatch):
    """Most tests have no database; with none stored, every price comes from the (mocked) live lookup."""
    from backend import holdings_service

    monkeypatch.setattr(holdings_service, "_recent_stored_prices", lambda keys: {})
