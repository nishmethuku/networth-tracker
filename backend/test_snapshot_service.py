"""
Tests for snapshot_service._compute_totals and _validate_snapshot.
"""
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import snapshot_service
from backend.snapshot_service import SnapshotRefusedError


def test_compute_totals_sums_display_currency_gains_not_native_currency():
    """Regression: total_profit_loss summed the bare "total_gain"/"gain"
    fields, which stay in each holding's own currency -- a USD holding up
    $100 and an INR holding up ₹8300 (also $100 at an ~83 rate) should sum
    to $200, not 8400 (100 raw USD + 8300 raw INR added as if the same
    unit)."""
    usd_stock = {
        "asset_type": "stock", "display_value": 1000.0,
        "realized_gain": 0.0, "display_realized_gain": 0.0,
        "unrealized_gain": 100.0, "display_unrealized_gain": 100.0,
    }
    inr_stock = {
        "asset_type": "stock", "display_value": 500.0,
        "realized_gain": 0.0, "display_realized_gain": 0.0,
        # 8300 INR unrealized gain converts to 100 USD -- using the raw
        # "unrealized_gain" here would add 8300 instead of 100.
        "unrealized_gain": 8300.0, "display_unrealized_gain": 100.0,
    }
    inr_real_estate = {
        "asset_type": "real_estate", "display_value": 2000.0,
        "gain": 41500.0, "display_first_value": 1500.0,  # display gain = 2000 - 1500 = 500
    }

    with patch.object(snapshot_service, "list_holdings_with_metrics", return_value=[usd_stock, inr_stock, inr_real_estate]), \
         patch.object(snapshot_service, "total_liabilities_display", return_value=0.0):
        totals = snapshot_service._compute_totals(holdings=[], liabilities=[])

    assert totals["total_profit_loss"] == 700.0  # 100 + 100 + 500, all in display currency


def _holding(id=1, asset_type="stock", net_quantity=10, display_value=100.0, name="X"):
    return {
        "id": id, "asset_type": asset_type,
        "net_quantity": net_quantity, "display_value": display_value,
        "name": name, "display_realized_gain": 0.0, "display_unrealized_gain": 0.0,
    }


def _mock_holding_obj(id=1):
    h = MagicMock()
    h.id = id
    return h


def test_validate_snapshot_passes_when_prices_ok():
    metrics = [_holding(display_value=1000.0)]
    holdings = [_mock_holding_obj()]
    with patch.object(snapshot_service, "NetWorthSnapshot"), \
         patch.object(snapshot_service, "HoldingTransaction"):
        # Should not raise
        snapshot_service._validate_snapshot(metrics, holdings, 900.0, 1000.0, date.today())


def test_validate_snapshot_refuses_missing_price():
    # Stock holding with net qty > 0 but $0 value = price fetch failed
    metrics = [_holding(asset_type="stock", net_quantity=5, display_value=0.0, name="TSLA")]
    holdings = [_mock_holding_obj()]
    with patch.object(snapshot_service, "NetWorthSnapshot"), \
         patch.object(snapshot_service, "HoldingTransaction"):
        try:
            snapshot_service._validate_snapshot(metrics, holdings, 1000.0, 0.0, date.today())
            assert False, "Expected SnapshotRefusedError"
        except SnapshotRefusedError as e:
            assert "TSLA" in str(e)
            assert "missing" in str(e).lower()


def test_validate_snapshot_allows_zero_qty_zero_value():
    # A fully-sold position should not trigger the missing price guard.
    # Pass previous=None so the drop guard is also skipped.
    metrics = [_holding(asset_type="stock", net_quantity=0, display_value=0.0)]
    holdings = [_mock_holding_obj()]
    snapshot_service._validate_snapshot(metrics, holdings, None, 0.0, date.today())


def test_validate_snapshot_refuses_30pct_drop_no_sells():
    metrics = [_holding(display_value=600.0)]
    holdings = [_mock_holding_obj()]
    # Use injectable helpers so no DB access needed
    try:
        snapshot_service._validate_snapshot(
            metrics, holdings, 1000.0, 600.0, date.today(),
            _sell_proceeds_fn=lambda holdings, since: 0.0,
            _last_snap_date_fn=lambda snap_date: date(2026, 10, 20),
        )
        assert False, "Expected SnapshotRefusedError"
    except SnapshotRefusedError as e:
        assert "40.0%" in str(e)


def test_validate_snapshot_allows_drop_with_large_sells():
    metrics = [_holding(display_value=600.0)]
    holdings = [_mock_holding_obj()]
    # $300 sell proceeds > 50% of $400 drop → should be allowed
    snapshot_service._validate_snapshot(
        metrics, holdings, 1000.0, 600.0, date.today(),
        _sell_proceeds_fn=lambda holdings, since: 300.0,
        _last_snap_date_fn=lambda snap_date: date(2026, 10, 20),
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
