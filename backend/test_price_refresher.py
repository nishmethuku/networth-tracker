from types import SimpleNamespace

from backend import holdings_service as hs
from backend import price_refresher as pr


def test_refresher_never_starts_in_tests_or_cli():
    app = SimpleNamespace(config={"TESTING": True})
    assert pr.start_if_enabled(app) is False


def test_symbols_tried_lately_are_not_looked_up_again_by_a_page(monkeypatch):
    key = ("stock", "DEAD.NS", "INR")
    pr._attempted.clear()
    assert pr.recently_attempted(key) is False
    pr._mark_attempted(key)
    assert pr.recently_attempted(key) is True
    pr._attempted.clear()


def test_page_skips_live_lookup_for_tried_symbols_and_uses_last_saved_price(monkeypatch):
    tried, fresh = ("stock", "OLD.NS", "INR"), ("stock", "NEW", "USD")
    pr._attempted.clear()
    pr._mark_attempted(tried)
    monkeypatch.setattr(hs, "_latest_stored_prices", lambda keys, days=7: {tried: 42.0})
    cache = {}
    remaining = hs._skip_keys_the_refresher_tried(cache, [tried, fresh])
    assert remaining == [fresh]
    assert cache == {tried: 42.0}
    pr._attempted.clear()


def test_dead_symbol_with_no_saved_price_is_skipped_with_no_price(monkeypatch):
    dead = ("stock", "DHFL.NS", "INR")
    pr._attempted.clear()
    pr._mark_attempted(dead)
    monkeypatch.setattr(hs, "_latest_stored_prices", lambda keys, days=7: {})
    cache = {}
    assert hs._skip_keys_the_refresher_tried(cache, [dead]) == []
    assert cache == {dead: None}
    pr._attempted.clear()
