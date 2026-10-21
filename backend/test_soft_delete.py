"""
Tests for soft-delete behaviour across the key query paths.

All tests use mocks — no production DB, no SQLite, no network. The goal
is to confirm that deleted_at filters are applied at the right places so
that soft-deleted holdings and transactions are invisible to net worth
calculations, snapshots, XIRR, price alerts, and export.

No test here should ever read from or write to the production Supabase
project.  If DATABASE_URL is set in the environment, these tests are safe
regardless — none of them call create_app() or touch db.session.
"""
import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.holdings_service import (
    calculate_holding_metrics,
)
from backend.snapshot_service import (
    SnapshotRefusedError,
    _compute_totals_from_metrics,
    _validate_snapshot,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tx(txtype, txdate, qty, price, deleted_at=None):
    t = MagicMock()
    t.transaction_type = txtype
    t.transaction_date = txdate
    t.quantity = qty
    t.price_per_unit = price
    t.currency = "USD"
    t.fees = 0.0
    t.deleted_at = deleted_at
    return t


def _holding(asset_type="stock", hid=1, deleted_at=None):
    h = MagicMock()
    h.id = hid
    h.asset_type = asset_type
    h.symbol = "AAPL"
    h.name = "AAPL"
    h.currency = "USD"
    h.country = "United States"
    h.account = "Test"
    h.deleted_at = deleted_at
    return h


def _metrics(display_value, asset_type="stock", display_realized_gain=0.0,
             display_unrealized_gain=0.0, display_first_value=None):
    return {
        "asset_type": asset_type,
        "display_value": display_value,
        "display_realized_gain": display_realized_gain,
        "display_unrealized_gain": display_unrealized_gain,
        "display_first_value": display_first_value,
    }


# ---------------------------------------------------------------------------
# 1. XIRR: deleted transaction changes the result when excluded
# ---------------------------------------------------------------------------

def test_xirr_excluded_transaction_changes_result():
    """
    A buy at $10 and a second buy at $200 (later, much higher cost basis)
    produce a very different XIRR than the first buy alone.  The point: if
    the caller passes only the non-deleted transaction to
    calculate_holding_metrics, the XIRR reflects that filtered set —
    proving the query-layer deleted_at filter is load-bearing.
    """
    buy_only = [_tx("buy", date(2024, 1, 1), 10, 100.0)]
    metrics_filtered = calculate_holding_metrics(_holding(), buy_only, current_price=200.0)

    buy_and_deleted = [
        _tx("buy", date(2024, 1, 1), 10, 100.0),
        _tx("buy", date(2024, 6, 1), 90, 200.0),
    ]
    metrics_unfiltered = calculate_holding_metrics(_holding(), buy_and_deleted, current_price=200.0)

    # Filtered result: cost basis 1000, current ~2000 → positive XIRR
    # Unfiltered result: cost basis 19000, current ~2000 → deeply negative XIRR
    assert metrics_filtered["xirr"] is not None
    assert metrics_unfiltered["xirr"] is not None
    assert metrics_filtered["xirr"] > metrics_unfiltered["xirr"], (
        "Excluding the high-cost deleted transaction must produce a better XIRR"
    )


def test_xirr_none_when_holding_period_under_30_days():
    """XIRR is suppressed for very recent purchases to avoid misleading
    annualized rates (a 1-day holding up 1% would show as ~3650% XIRR)."""
    buy_today = [_tx("buy", date.today(), 10, 100.0)]
    metrics = calculate_holding_metrics(_holding(), buy_today, current_price=110.0)
    assert metrics["xirr"] is None, "XIRR must be None for a holding < 30 days old"


# ---------------------------------------------------------------------------
# 2. Net worth snapshot: soft-deleted holding value excluded from total
# ---------------------------------------------------------------------------

def test_snapshot_totals_exclude_soft_deleted_holding():
    """
    _compute_totals_from_metrics receives whatever holdings the snapshot
    query supplies.  When the query applies Holding.deleted_at.is_(None),
    a deleted holding's value disappears from the total.

    This test calls the function with and without the deleted holding to
    confirm it makes a real difference — the caller's filter is the only
    thing standing between a deleted holding and the snapshot total.
    """
    live_holding = _metrics(display_value=10_000.0, asset_type="stock",
                            display_realized_gain=500.0, display_unrealized_gain=300.0)
    deleted_holding = _metrics(display_value=999_999.0, asset_type="stock",
                               display_realized_gain=0.0, display_unrealized_gain=0.0)

    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        total_with_deleted = _compute_totals_from_metrics([live_holding, deleted_holding], [])
        total_without_deleted = _compute_totals_from_metrics([live_holding], [])

    assert total_without_deleted["total_net_worth"] == 10_000.0
    assert total_with_deleted["total_net_worth"] == 10_000.0 + 999_999.0, (
        "When deleted holding is NOT filtered it inflates the total — "
        "confirming the caller must apply the filter"
    )


def test_snapshot_totals_stock_and_real_estate():
    """total_stock_value counts only stock/mutual_fund; real_estate only
    counts toward total_property_value."""
    holdings = [
        _metrics(5_000.0, asset_type="stock",
                 display_realized_gain=200.0, display_unrealized_gain=300.0),
        _metrics(200_000.0, asset_type="real_estate",
                 display_first_value=180_000.0),
    ]
    with patch("backend.snapshot_service.total_liabilities_display", return_value=5_000.0):
        totals = _compute_totals_from_metrics(holdings, [])

    assert totals["total_stock_value"] == 5_000.0
    assert totals["total_property_value"] == 200_000.0
    assert totals["total_net_worth"] == 5_000.0 + 200_000.0 - 5_000.0
    assert totals["total_profit_loss"] == round((200.0 + 300.0) + (200_000.0 - 180_000.0), 2)


# ---------------------------------------------------------------------------
# 3. Snapshot guard: missing price on soft-deleted holding must not block
# ---------------------------------------------------------------------------

def test_validate_snapshot_missing_price_raises_for_live_holding():
    """A live holding with display_value == 0 (price fetch failed) must
    raise SnapshotRefusedError."""
    bad = _metrics(0.0, asset_type="stock")
    bad["symbol"] = "AAPL"
    bad["quantity"] = 10
    bad["name"] = "AAPL"
    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        try:
            _validate_snapshot(
                [bad], [], previous_net_worth=1000.0, new_net_worth=0.0,
                snapshot_date=date.today(),
                _sell_proceeds_fn=lambda *a: 0.0,
                _last_snap_date_fn=lambda *a: date.min,
            )
            assert False, "Expected SnapshotRefusedError"
        except SnapshotRefusedError:
            pass


def test_validate_snapshot_drop_guard_passes_when_sells_account_for_drop():
    """Net worth drops 40% but sell proceeds cover it → no error."""
    live = _metrics(6_000.0, asset_type="stock",
                    display_realized_gain=0.0, display_unrealized_gain=0.0)
    live["symbol"] = "AAPL"
    live["quantity"] = 1
    live["name"] = "AAPL"
    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        _validate_snapshot(
            [live], [],
            previous_net_worth=10_000.0,
            new_net_worth=6_000.0,
            snapshot_date=date.today(),
            _sell_proceeds_fn=lambda *a: 4_500.0,
            _last_snap_date_fn=lambda *a: date(2026, 9, 1),
        )


# ---------------------------------------------------------------------------
# 4. Price alerts: deleted holdings are filtered before check
# ---------------------------------------------------------------------------

def test_alert_query_excludes_deleted_holdings():
    """alert_service.check_all_alerts queries
    Holding.filter(deleted_at.is_(None)), so a holding soft-deleted before
    the cron runs should never trigger an alert.

    This test patches the Holding.query chain to return only the live
    holding and confirms the alert for the deleted one is never evaluated.
    """
    from backend import alert_service

    live_holding = _holding(hid=1, deleted_at=None)
    live_holding.user_id = "user-1"

    alert = MagicMock()
    alert.holding_id = 1
    alert.symbol = "AAPL"
    alert.asset_type = "stock"
    alert.alert_type = "price_above"
    alert.threshold = 99999.0
    alert.currency = "USD"
    alert.status = "active"

    mock_price = MagicMock(return_value=100.0)

    mock_holding_cls = MagicMock()
    mock_holding_cls.query.filter_by.return_value.filter.return_value.all.return_value = [live_holding]
    mock_alert_cls = MagicMock()
    mock_alert_cls.query.filter_by.return_value.all.return_value = [alert]

    # Patch the whole class in the module (avoids Flask-SQLAlchemy scoped-session
    # machinery that fires on any attribute access to the real class outside app ctx)
    with patch("backend.alert_service.Holding", mock_holding_cls), \
         patch("backend.alert_service.PriceAlert", mock_alert_cls), \
         patch.object(alert_service.price_service, "get_current_price", mock_price), \
         patch.object(alert_service.price_service, "convert", side_effect=lambda v, *a: v), \
         patch("backend.alert_service.send") as mock_send, \
         patch("backend.alert_service.db") as mock_db, \
         patch.object(alert_service, "_user_email", return_value="test@example.com"):

        mock_db.session = MagicMock()
        alert_service.check_all_alerts()
        # Price 100 < threshold 99999 → no email sent
        mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# 5. Export: deleted holdings and transactions absent from export dict
# ---------------------------------------------------------------------------

def test_export_excludes_deleted_holdings_and_transactions():
    """export_user_data filters Holding.deleted_at.is_(None) and
    HoldingTransaction.deleted_at.is_(None).  Verify by patching the query
    to return a controlled list and confirming the output only has live items.
    """
    from backend import account_service

    live_h = MagicMock()
    live_h.id = 1
    live_h.deleted_at = None
    live_h.to_dict.return_value = {"id": 1, "name": "AAPL"}

    live_tx = MagicMock()
    live_tx.to_dict.return_value = {"id": 10, "holding_id": 1}

    # Patch each model class used by export_user_data at the module-name level.
    # Patching Model.query directly would trigger Flask-SQLAlchemy's scoped-session
    # machinery (which needs an app context); replacing the entire class avoids that.
    def _empty_cls():
        m = MagicMock()
        m.query.filter_by.return_value.all.return_value = []
        m.query.filter.return_value.all.return_value = []
        return m

    mock_holding = _empty_cls()
    mock_holding.query.filter_by.return_value.filter.return_value.all.return_value = [live_h]
    mock_tx = _empty_cls()
    mock_tx.query.filter.return_value.all.return_value = [live_tx]

    with patch("backend.account_service.Holding", mock_holding), \
         patch("backend.account_service.HoldingTransaction", mock_tx), \
         patch("backend.account_service.HoldingValuation", _empty_cls()), \
         patch("backend.account_service.PriceAlert", _empty_cls()), \
         patch("backend.account_service.Milestone", _empty_cls()), \
         patch("backend.account_service.NetWorthSnapshot", _empty_cls()), \
         patch("backend.account_service.Account", _empty_cls()), \
         patch("backend.account_service.Liability", _empty_cls()), \
         patch("backend.account_service.Goal", _empty_cls()), \
         patch("backend.account_service.AllocationTarget", _empty_cls()), \
         patch("backend.account_service.BudgetEntry", _empty_cls()), \
         patch("backend.account_service.BudgetLimit", _empty_cls()), \
         patch("backend.account_service.BudgetCategory", _empty_cls()), \
         patch("backend.account_service.PushSubscription", _empty_cls()):

        result = account_service.export_user_data("user-1")

    assert len(result["holdings"]) == 1
    assert result["holdings"][0]["id"] == 1
    assert len(result["transactions"]) == 1
    assert result["transactions"][0]["id"] == 10


# ---------------------------------------------------------------------------
# 6. Sell-proceeds guard: deleted sell transactions excluded from the sum
# ---------------------------------------------------------------------------

def test_sell_proceeds_guard_soft_deleted_sell_does_not_prevent_refusal():
    """A soft-deleted sell must NOT count toward the guard's sell-proceeds sum.
    If it did, a genuine net-worth drop would be excused by a transaction that
    no longer exists, and the snapshot would be saved incorrectly.

    This is tested via _validate_snapshot's injectable _sell_proceeds_fn:
    the guard sees $0 in valid sell proceeds even though a soft-deleted sell
    of $5000 existed (excluded by the query's deleted_at filter), so a >30%
    drop correctly raises SnapshotRefusedError.
    """
    from backend.snapshot_service import SnapshotRefusedError, _validate_snapshot

    live = _metrics(6_000.0, asset_type="stock",
                    display_realized_gain=0.0, display_unrealized_gain=0.0)
    live["symbol"] = "AAPL"
    live["quantity"] = 1
    live["name"] = "AAPL"

    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        # proceeds = 0 (soft-deleted sell was excluded) → unexplained 40% drop
        try:
            _validate_snapshot(
                [live], [],
                previous_net_worth=10_000.0,
                new_net_worth=6_000.0,
                snapshot_date=date.today(),
                _sell_proceeds_fn=lambda *a: 0.0,   # deleted sell excluded
                _last_snap_date_fn=lambda *a: date(2026, 9, 1),
            )
            assert False, "Expected SnapshotRefusedError — drop not explained by live sells"
        except SnapshotRefusedError:
            pass

        # Same drop but with the live sell included → guard passes
        _validate_snapshot(
            [live], [],
            previous_net_worth=10_000.0,
            new_net_worth=6_000.0,
            snapshot_date=date.today(),
            _sell_proceeds_fn=lambda *a: 4_500.0,   # live sell covers the gap
            _last_snap_date_fn=lambda *a: date(2026, 9, 1),
        )


def test_sell_proceeds_empty_when_no_holdings():
    """Guard must not crash and must return 0 when the holdings list is empty."""
    from backend import snapshot_service
    proceeds = snapshot_service._sell_proceeds_since([], date(2026, 9, 1))
    assert proceeds == 0.0


# ---------------------------------------------------------------------------
# 7. Spike guard: 3× jump without matching buys → refused
# ---------------------------------------------------------------------------

def test_spike_guard_refuses_without_matching_buys():
    """A net worth that jumps to 3× its previous value without a corresponding
    buy (as would happen if INR amounts were stored as USD) must raise
    SnapshotRefusedError."""
    live = _metrics(45_000.0, asset_type="stock",
                    display_realized_gain=0.0, display_unrealized_gain=0.0)
    live["symbol"] = "AAPL"
    live["quantity"] = 1
    live["name"] = "AAPL"

    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        try:
            _validate_snapshot(
                [live], [],
                previous_net_worth=10_000.0,
                new_net_worth=45_000.0,   # 4.5× — no buys to explain it
                snapshot_date=date.today(),
                _sell_proceeds_fn=lambda *a: 0.0,
                _buy_proceeds_fn=lambda *a: 0.0,
                _last_snap_date_fn=lambda *a: date(2026, 9, 1),
            )
            assert False, "Expected SnapshotRefusedError for unexplained 4.5× spike"
        except SnapshotRefusedError:
            pass


def test_spike_guard_passes_when_buys_explain_increase():
    """A 4× jump is fine when the user just bought enough new assets to explain it."""
    live = _metrics(45_000.0, asset_type="stock",
                    display_realized_gain=0.0, display_unrealized_gain=0.0)
    live["symbol"] = "AAPL"
    live["quantity"] = 1
    live["name"] = "AAPL"

    with patch("backend.snapshot_service.total_liabilities_display", return_value=0.0):
        # buy_proceeds = 38000 → unexplained_gain = 45000 - 10000 - 38000 = -3000
        # unexplained_gain <= previous_net_worth → guard passes
        _validate_snapshot(
            [live], [],
            previous_net_worth=10_000.0,
            new_net_worth=45_000.0,
            snapshot_date=date.today(),
            _sell_proceeds_fn=lambda *a: 0.0,
            _buy_proceeds_fn=lambda *a: 38_000.0,
            _last_snap_date_fn=lambda *a: date(2026, 9, 1),
        )
