"""
Daily net worth snapshot computation. Called by the /internal/snapshot
endpoint, which a scheduled job (GitHub Actions cron) hits once a day.
Upserts so a manual re-run for the same day is safe. Also detects newly-
crossed net worth milestones and emails a celebration.
"""
from datetime import date
from typing import Optional

from . import price_service
from .email_service import send, render_milestone_email
from .models import db, Holding, Milestone, NetWorthSnapshot
from .holdings_service import list_holdings_with_metrics, QUANTITY_BASED_TYPES

MILESTONE_THRESHOLDS = {
    "USD": [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000],
    "INR": [1_000_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000],  # 10L..10Cr
    "AUD": [15_000, 75_000, 150_000, 375_000, 750_000, 1_500_000, 3_000_000, 7_500_000, 15_000_000],
}


def _compute_totals(holdings):
    holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")

    total_net_worth = 0.0
    total_stock_value = 0.0
    total_property_value = 0.0
    total_profit_loss = 0.0
    by_asset_type = {}

    for h in holdings_with_metrics:
        current_value = h["display_value"]
        total_net_worth += current_value

        if h["asset_type"] in ("stock", "mutual_fund"):
            total_stock_value += current_value
        if h["asset_type"] == "real_estate":
            total_property_value += current_value

        if h["asset_type"] in QUANTITY_BASED_TYPES:
            total_profit_loss += h.get("total_gain", 0.0)
        else:
            total_profit_loss += h.get("gain", 0.0)

        by_asset_type[h["asset_type"]] = by_asset_type.get(h["asset_type"], 0.0) + current_value

    return {
        "total_net_worth": round(total_net_worth, 2),
        "total_stock_value": round(total_stock_value, 2),
        "total_property_value": round(total_property_value, 2),
        "total_profit_loss": round(total_profit_loss, 2),
        "by_asset_type": {k: round(v, 2) for k, v in by_asset_type.items()},
    }


def _upsert_snapshot(user_id, household_id, snapshot_date, totals):
    query = NetWorthSnapshot.query.filter_by(snapshot_date=snapshot_date)
    query = query.filter_by(user_id=user_id) if user_id is not None else query.filter_by(household_id=household_id)
    existing = query.first()

    if existing:
        existing.total_net_worth = totals["total_net_worth"]
        existing.total_stock_value = totals["total_stock_value"]
        existing.total_property_value = totals["total_property_value"]
        existing.total_profit_loss = totals["total_profit_loss"]
        existing.by_asset_type = totals["by_asset_type"]
    else:
        db.session.add(NetWorthSnapshot(
            user_id=user_id,
            household_id=household_id,
            snapshot_date=snapshot_date,
            **totals,
        ))


def _check_milestones(user_id, household_id, net_worth_usd: float, snapshot_date: date, recipient_email: Optional[str]):
    for currency, thresholds in MILESTONE_THRESHOLDS.items():
        net_worth = price_service.convert(net_worth_usd, "USD", currency)

        existing_thresholds = {
            m.threshold for m in Milestone.query.filter_by(
                user_id=user_id, household_id=household_id, currency=currency
            ).all()
        }

        for threshold in thresholds:
            if net_worth >= threshold and threshold not in existing_thresholds:
                db.session.add(Milestone(
                    user_id=user_id, household_id=household_id,
                    threshold=threshold, currency=currency, achieved_date=snapshot_date,
                ))
                if recipient_email:
                    send(recipient_email, f"You crossed {threshold:,.0f} {currency}! 🎉", render_milestone_email(threshold, currency))


def snapshot_all_users(snapshot_date: Optional[date] = None):
    """Compute and store one snapshot row per user with holdings, and one per
    household with shared holdings, for the given date (default: today).
    Also checks for newly-crossed net worth milestones."""
    from sqlalchemy import text

    snapshot_date = snapshot_date or date.today()

    user_ids = [row[0] for row in db.session.query(Holding.user_id).distinct()]
    for user_id in user_ids:
        holdings = Holding.query.filter_by(user_id=user_id).all()
        totals = _compute_totals(holdings)
        _upsert_snapshot(user_id=user_id, household_id=None, snapshot_date=snapshot_date, totals=totals)

        email_row = db.session.execute(
            text("select email from auth.users where id = :user_id"), {"user_id": str(user_id)}
        ).first()
        _check_milestones(user_id, None, totals["total_net_worth"], snapshot_date, email_row[0] if email_row else None)

    household_ids = [
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    ]
    for household_id in household_ids:
        holdings = Holding.query.filter_by(household_id=household_id, is_private=False).all()
        totals = _compute_totals(holdings)
        _upsert_snapshot(user_id=None, household_id=household_id, snapshot_date=snapshot_date, totals=totals)

        owner_row = db.session.execute(
            text("select owner_id from households where id = :household_id"), {"household_id": str(household_id)}
        ).first()
        owner_email = None
        if owner_row:
            email_row = db.session.execute(
                text("select email from auth.users where id = :user_id"), {"user_id": str(owner_row[0])}
            ).first()
            owner_email = email_row[0] if email_row else None
        _check_milestones(None, household_id, totals["total_net_worth"], snapshot_date, owner_email)

    db.session.commit()
    return {"users_snapshotted": len(user_ids), "households_snapshotted": len(household_ids)}
