"""Tests for history_rebuild_service.rebuild_history (no database: models are mocked)."""
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import history_rebuild_service as svc
from backend.history_backfill import HoldingRecord


def _record():
    return HoldingRecord(
        asset_type="stock", symbol="AAA", currency="USD",
        transactions=[(date(2026, 1, 10), "buy", 10)],
    )


def _price(asset_type, symbol, on_date):
    return (100.0, "USD")


def _rate(a, b, d):
    return 1.0


def _run(records, existing_dates=(), liabilities=0, **kwargs):
    existing = [MagicMock(snapshot_date=d) for d in existing_dates]
    with patch.object(svc, "Liability") as liab, \
         patch.object(svc, "NetWorthSnapshot") as snap, \
         patch.object(svc, "load_records", return_value=records), \
         patch.object(svc, "db") as db:
        liab.query.filter.return_value.count.return_value = liabilities
        snap.query.filter.return_value.all.return_value = existing
        result = svc.rebuild_history("u1", today=date(2026, 4, 15), price_fn=_price, rate_fn=_rate, **kwargs)
        return result, snap, db


def test_refuses_users_with_liabilities():
    result, snap, db = _run([_record()], liabilities=1)
    assert result == {"status": "has_liabilities"}
    db.session.commit.assert_not_called()


def test_nothing_recorded():
    result, _, _ = _run([])
    assert result["status"] == "nothing_recorded"


def test_preview_lists_months_and_writes_nothing():
    result, snap, db = _run([_record()])
    assert result["status"] == "preview"
    assert [m["date"] for m in result["months"]] == ["2026-02-01", "2026-03-01", "2026-04-01"]
    assert result["months"][0]["total"] == 1000.0
    snap.assert_not_called()
    db.session.commit.assert_not_called()


def test_apply_saves_only_missing_months():
    result, snap, db = _run([_record()], existing_dates=[date(2026, 3, 1)], apply=True)
    assert result["status"] == "saved"
    assert [m["date"] for m in result["months"]] == ["2026-02-01", "2026-04-01"]
    assert snap.call_count == 2
    db.session.commit.assert_called_once()


def test_up_to_date_when_every_month_has_a_snapshot():
    result, _, _ = _run([_record()], existing_dates=[date(2026, 2, 1), date(2026, 3, 1), date(2026, 4, 1)])
    assert result["status"] == "up_to_date"


def test_unpriceable_month_is_reported_not_saved():
    def no_price(asset_type, symbol, on_date):
        return None

    existing = []
    with patch.object(svc, "Liability") as liab, patch.object(svc, "NetWorthSnapshot") as snap, \
         patch.object(svc, "load_records", return_value=[_record()]), patch.object(svc, "db"):
        liab.query.filter.return_value.count.return_value = 0
        snap.query.filter.return_value.all.return_value = existing
        result = svc.rebuild_history("u1", apply=True, today=date(2026, 3, 15), price_fn=no_price, rate_fn=_rate)
    assert result["months"] == []
    assert result["skipped"][0]["date"] == "2026-02-01"
    snap.assert_not_called()


def test_only_the_most_recent_window_is_priced_and_more_to_do_is_set():
    rec = HoldingRecord(asset_type="stock", symbol="AAA", currency="USD",
                        transactions=[(date(2020, 1, 1), "buy", 1)])
    with patch.object(svc, "Liability") as liab, patch.object(svc, "NetWorthSnapshot") as snap, \
         patch.object(svc, "load_records", return_value=[rec]), patch.object(svc, "db"):
        liab.query.filter.return_value.count.return_value = 0
        snap.query.filter.return_value.all.return_value = []
        result = svc.rebuild_history("u1", today=date(2026, 4, 15), price_fn=_price, rate_fn=_rate)
    assert len(result["months"]) == svc.MAX_MONTHS_PER_RUN
    assert result["months"][-1]["date"] == "2026-04-01"
    assert result["more_to_do"] is True
