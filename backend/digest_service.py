"""
Weekly net worth digest computation and delivery. Called by
/internal/weekly-digest (a GitHub Actions cron, mirroring the daily snapshot
job).
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

from sqlalchemy import text

from . import ai_service
from .account_service import export_user_data_csv_zip
from .email_service import render_digest_email, send
from .holdings_service import list_holdings_with_metrics
from .liability_service import total_liabilities_display
from .models import Holding, Household, Liability, NetWorthSnapshot, db
from .unsubscribe_service import generate_unsubscribe_token, is_unsubscribed

logger = logging.getLogger(__name__)


def _recipients(user_id=None, household_id=None) -> List[Dict]:
    """Each recipient's email plus first name (from Supabase auth metadata,
    where set at signup — often absent, callers must handle None)."""
    if user_id is not None:
        row = db.session.execute(
            text("select email, raw_user_meta_data ->> 'full_name' as name from auth.users where id = :user_id"),
            {"user_id": str(user_id)},
        ).first()
        if not row:
            return []
        return [{"email": row[0], "name": (row[1] or "").split(" ")[0] or None}]
    rows = db.session.execute(
        text(
            """
            select au.email, au.raw_user_meta_data ->> 'full_name' as name
            from household_members hm
            join auth.users au on au.id = hm.user_id
            where hm.household_id = :household_id
            """
        ),
        {"household_id": str(household_id)},
    ).all()
    return [{"email": r[0], "name": (r[1] or "").split(" ")[0] or None} for r in rows]


def _recipient_emails(user_id=None, household_id=None) -> List[str]:
    return [r["email"] for r in _recipients(user_id=user_id, household_id=household_id)]


def _build_digest_for_scope(user_id=None, household_id=None) -> Dict:
    # is_private=False on the household branch matters here specifically:
    # this digest gets emailed to every household member, and without it a
    # member's private holding's name and value (via top_movers below) would
    # leak into an email the whole household receives — exactly what
    # is_private exists to prevent everywhere else in the app
    # (scoped_holdings_query in app.py, etc.). Caught while fixing the
    # adjacent net-worth/liabilities bug just above.
    query = (
        Holding.query.filter_by(user_id=user_id)
        if user_id is not None
        else Holding.query.filter_by(household_id=household_id, is_private=False)
    )
    holdings = query.all()
    holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")
    total_assets = sum(h["display_value"] for h in holdings_with_metrics)

    # Same assets-minus-liabilities net worth every other figure in the app
    # uses (dashboard, daily snapshots) — this digest predates the
    # liabilities feature and was never updated when it shipped, so it was
    # reporting an assets-only total here while comparing it against
    # past_snapshot.total_net_worth below, which *does* subtract
    # liabilities: a real week-over-week change miscalculation for anyone
    # with any liability at all.
    liab_query = Liability.query.filter_by(user_id=user_id) if user_id is not None else Liability.query.filter_by(household_id=household_id, is_private=False)
    total_liabilities = total_liabilities_display(liab_query.all(), display_currency="USD")
    net_worth = total_assets - total_liabilities

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

    household_name = None
    if household_id is not None:
        household = Household.query.get(household_id)
        household_name = household.name if household else None

    return {
        "user_id": str(user_id) if user_id else None,
        "household_id": str(household_id) if household_id else None,
        "household_name": household_name,
        "net_worth": round(net_worth, 2),
        "change_this_week": change,
        "top_movers": [
            {"name": m["name"], "unrealized_gain": round(m["unrealized_gain"], 2)} for m in movers[:3]
        ],
    }


def _narrative_for_digest(digest: Dict, recipient_name: Optional[str]) -> Optional[str]:
    if not ai_service.is_configured():
        return None
    return ai_service.generate_digest_narrative(digest, recipient_name=recipient_name)


def build_weekly_digest(send_emails: bool = True) -> List[Dict]:
    """One digest per user with holdings, and one per household with shared
    holdings. Emails each non-unsubscribed recipient unless send_emails=False
    (used by tests). The AI narrative (when configured) is generated once per
    digest scope using the first recipient's name, not once per recipient."""
    digests = []

    # Union with Liability, not just Holding -- someone (or a household)
    # tracking only debt with no holdings yet would otherwise never get a
    # digest at all, even though they'd still get daily snapshots (which
    # already does this union; this one was missed when it was written).
    user_ids = {row[0] for row in db.session.query(Holding.user_id).distinct()}
    user_ids |= {row[0] for row in db.session.query(Liability.user_id).distinct()}
    for user_id in user_ids:
        digest = _build_digest_for_scope(user_id=user_id)
        digests.append(digest)
        if send_emails:
            recipients = [r for r in _recipients(user_id=user_id) if not is_unsubscribed(r["email"])]
            narrative = _narrative_for_digest(digest, recipients[0]["name"]) if recipients else None
            backup_zip = None
            if recipients:
                try:
                    backup_zip = export_user_data_csv_zip(user_id)
                except Exception as e:
                    logger.error("Backup export failed for user %s: %s", user_id, e)
            for r in recipients:
                unsubscribe_token = generate_unsubscribe_token(r["email"])
                send(
                    r["email"],
                    "Your Weekly Net Worth Digest",
                    render_digest_email(digest, narrative=narrative, unsubscribe_token=unsubscribe_token, backup_attached=bool(backup_zip)),
                    attachments=[("networth-tracker-backup.zip", backup_zip)] if backup_zip else None,
                )

    household_ids = {
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    }
    household_ids |= {
        row[0] for row in
        db.session.query(Liability.household_id).filter(Liability.household_id.isnot(None)).distinct()
    }
    for household_id in household_ids:
        digest = _build_digest_for_scope(household_id=household_id)
        digests.append(digest)
        if send_emails:
            recipients = [r for r in _recipients(household_id=household_id) if not is_unsubscribed(r["email"])]
            narrative = _narrative_for_digest(digest, digest.get("household_name")) if recipients else None
            for r in recipients:
                unsubscribe_token = generate_unsubscribe_token(r["email"])
                send(
                    r["email"],
                    "Your Weekly Household Net Worth Digest",
                    render_digest_email(digest, narrative=narrative, unsubscribe_token=unsubscribe_token),
                )

    return digests
