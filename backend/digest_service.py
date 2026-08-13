"""
Weekly net worth digest computation. Called by /internal/weekly-digest
(a GitHub Actions cron, mirroring the daily snapshot job). The aggregation
here is real; actual email delivery is stubbed — see app.py's route
docstring — since sending mail needs a provider account (Resend/SendGrid/SES)
that hasn't been set up yet.
"""
from datetime import date, timedelta
from typing import Dict, List

from .models import db, Holding, NetWorthSnapshot
from .holdings_service import list_holdings_with_metrics


def _build_digest_for_scope(user_id=None, household_id=None) -> Dict:
    query = Holding.query.filter_by(user_id=user_id) if user_id is not None else Holding.query.filter_by(household_id=household_id)
    holdings = query.all()
    holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")
    net_worth = sum(h["display_value"] for h in holdings_with_metrics)

    week_ago = date.today() - timedelta(days=7)
    snap_query = NetWorthSnapshot.query.filter_by(user_id=user_id) if user_id is not None else NetWorthSnapshot.query.filter_by(household_id=household_id)
    past_snapshot = (
        snap_query.filter(NetWorthSnapshot.snapshot_date <= week_ago)
        .order_by(NetWorthSnapshot.snapshot_date.desc())
        .first()
    )
    change = round(net_worth - past_snapshot.total_net_worth, 2) if past_snapshot else None

    movers = sorted(
        (h for h in holdings_with_metrics if h.get("unrealized_gain") is not None),
        key=lambda h: h.get("unrealized_gain", 0),
        reverse=True,
    )

    return {
        "user_id": str(user_id) if user_id else None,
        "household_id": str(household_id) if household_id else None,
        "net_worth": round(net_worth, 2),
        "change_this_week": change,
        "top_movers": [
            {"name": m["name"], "unrealized_gain": round(m["unrealized_gain"], 2)} for m in movers[:3]
        ],
    }


def build_weekly_digest() -> List[Dict]:
    """One digest per user with holdings, and one per household with shared holdings."""
    digests = []

    user_ids = [row[0] for row in db.session.query(Holding.user_id).distinct()]
    for user_id in user_ids:
        digests.append(_build_digest_for_scope(user_id=user_id))

    household_ids = [
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    ]
    for household_id in household_ids:
        digests.append(_build_digest_for_scope(household_id=household_id))

    return digests
