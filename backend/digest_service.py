"""
Weekly net worth digest computation and delivery. Called by
/internal/weekly-digest (a GitHub Actions cron, mirroring the daily snapshot
job).
"""
from datetime import date, timedelta
from typing import Dict, List

from sqlalchemy import text

from .models import db, Holding, NetWorthSnapshot
from .holdings_service import list_holdings_with_metrics
from .email_service import send, render_digest_email


def _recipient_emails(user_id=None, household_id=None) -> List[str]:
    if user_id is not None:
        row = db.session.execute(
            text("select email from auth.users where id = :user_id"), {"user_id": str(user_id)}
        ).first()
        return [row[0]] if row else []
    rows = db.session.execute(
        text(
            """
            select au.email from household_members hm
            join auth.users au on au.id = hm.user_id
            where hm.household_id = :household_id
            """
        ),
        {"household_id": str(household_id)},
    ).all()
    return [r[0] for r in rows]


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


def build_weekly_digest(send_emails: bool = True) -> List[Dict]:
    """One digest per user with holdings, and one per household with shared
    holdings. Emails each recipient unless send_emails=False (used by tests)."""
    digests = []

    user_ids = [row[0] for row in db.session.query(Holding.user_id).distinct()]
    for user_id in user_ids:
        digest = _build_digest_for_scope(user_id=user_id)
        digests.append(digest)
        if send_emails:
            for email in _recipient_emails(user_id=user_id):
                send(email, "Your Weekly Net Worth Digest", render_digest_email(digest))

    household_ids = [
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    ]
    for household_id in household_ids:
        digest = _build_digest_for_scope(household_id=household_id)
        digests.append(digest)
        if send_emails:
            for email in _recipient_emails(household_id=household_id):
                send(email, "Your Weekly Household Net Worth Digest", render_digest_email(digest))

    return digests
