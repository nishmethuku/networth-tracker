"""
Tests for digest_service: display-currency mover ranking and the
null-email crash guard in _recipients.
"""
import os
import sys
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import digest_service


def test_build_digest_top_movers_use_display_currency_gain():
    """Regression: top_movers was ranked and rendered using the bare
    native-currency "unrealized_gain" field -- an INR holding up ₹8300
    (=$100) would outrank/mis-display next to a USD holding up $50 as if
    8300 and 50 were the same unit."""
    usd_holding = {"name": "AAPL", "display_value": 1000.0, "unrealized_gain": 50.0, "display_unrealized_gain": 50.0}
    inr_holding = {"name": "RELIANCE", "display_value": 500.0, "unrealized_gain": 8300.0, "display_unrealized_gain": 100.0}

    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.all.return_value = []
    mock_liability_query = MagicMock()
    mock_liability_query.filter_by.return_value.all.return_value = []
    mock_snapshot_query = MagicMock()
    mock_snapshot_query.filter_by.return_value.filter.return_value.order_by.return_value.first.return_value = None

    with patch.object(digest_service, "Holding") as mock_holding_model, \
         patch.object(digest_service, "Liability") as mock_liability_model, \
         patch.object(digest_service, "NetWorthSnapshot") as mock_snapshot_model, \
         patch.object(digest_service, "list_holdings_with_metrics", return_value=[usd_holding, inr_holding]), \
         patch.object(digest_service, "total_liabilities_display", return_value=0.0), \
         patch.object(digest_service, "most_recent_entry_date", return_value=None):
        mock_holding_model.query = mock_holding_query
        mock_liability_model.query = mock_liability_query
        mock_snapshot_model.query = mock_snapshot_query
        # NetWorthSnapshot.snapshot_date <= week_ago is evaluated eagerly
        # (as the argument to .filter()), so the mocked class attribute
        # needs a working comparison operator, not just a mocked .filter().
        mock_snapshot_model.snapshot_date.__le__ = MagicMock(return_value=True)

        digest = digest_service._build_digest_for_scope(user_id="u1")

    assert digest["top_movers"][0] == {"name": "RELIANCE", "unrealized_gain": 100.0}
    assert digest["top_movers"][1] == {"name": "AAPL", "unrealized_gain": 50.0}


def _mocked_scope(**overrides):
    """Common patching for _build_digest_for_scope, so the nudge-specific
    tests below only need to specify what they actually vary."""
    mock_holding_query = MagicMock()
    mock_holding_query.filter_by.return_value.all.return_value = []
    mock_liability_query = MagicMock()
    mock_liability_query.filter_by.return_value.all.return_value = []
    mock_snapshot_query = MagicMock()
    mock_snapshot_query.filter_by.return_value.filter.return_value.order_by.return_value.first.return_value = None

    stack = [
        patch.object(digest_service, "Holding", MagicMock(query=mock_holding_query)),
        patch.object(digest_service, "Liability", MagicMock(query=mock_liability_query)),
        patch.object(digest_service, "list_holdings_with_metrics", return_value=[]),
        patch.object(digest_service, "total_liabilities_display", return_value=0.0),
    ]
    mock_snapshot_model = MagicMock(query=mock_snapshot_query)
    mock_snapshot_model.snapshot_date.__le__ = MagicMock(return_value=True)
    stack.append(patch.object(digest_service, "NetWorthSnapshot", mock_snapshot_model))
    stack.append(patch.object(digest_service, "most_recent_entry_date", **overrides))
    return stack


def test_build_digest_flags_a_nudge_when_budget_has_gone_quiet():
    from datetime import date, timedelta

    stale_date = date.today() - timedelta(days=10)
    with ExitStack() as ctx:
        for p in _mocked_scope(return_value=stale_date):
            ctx.enter_context(p)
        digest = digest_service._build_digest_for_scope(user_id="u1")

    assert digest["needs_budget_nudge"] is True
    assert digest["days_since_budget_entry"] == 10


def test_build_digest_does_not_nudge_someone_recently_active():
    from datetime import date, timedelta

    recent_date = date.today() - timedelta(days=2)
    with ExitStack() as ctx:
        for p in _mocked_scope(return_value=recent_date):
            ctx.enter_context(p)
        digest = digest_service._build_digest_for_scope(user_id="u1")

    assert digest["needs_budget_nudge"] is False


def test_build_digest_does_not_nudge_someone_who_never_logged_anything():
    with ExitStack() as ctx:
        for p in _mocked_scope(return_value=None):
            ctx.enter_context(p)
        digest = digest_service._build_digest_for_scope(user_id="u1")

    assert digest["needs_budget_nudge"] is False
    assert digest["days_since_budget_entry"] is None


def test_recipients_filters_out_members_with_no_email():
    """Regression: email is nullable in Supabase auth.users (phone/OAuth-
    only accounts). A None email previously reached is_unsubscribed's
    email.lower(), an unhandled AttributeError that aborted the entire
    build_weekly_digest run, not just that one user's digest."""
    rows = [("a@example.com", "Alice"), (None, "NoEmail"), ("b@example.com", None)]

    with patch.object(digest_service, "db") as mock_db:
        mock_db.session.execute.return_value.all.return_value = rows
        recipients = digest_service._recipients(household_id="hh-1")

    assert [r["email"] for r in recipients] == ["a@example.com", "b@example.com"]


def test_recipients_returns_empty_for_a_user_with_no_email():
    with patch.object(digest_service, "db") as mock_db:
        mock_db.session.execute.return_value.first.return_value = (None, "NoEmail")
        recipients = digest_service._recipients(user_id="u1")

    assert recipients == []


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
