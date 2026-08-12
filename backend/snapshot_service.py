"""
Daily net worth snapshot computation.
Called by the /internal/snapshot endpoint, which a scheduled job (GitHub
Actions cron) hits once a day. Upserts so a manual re-run for the same day
is safe.
"""
from datetime import date
from typing import Optional

from .models import db, Asset, NetWorthSnapshot
from .services import calculate_asset_metrics


def _compute_totals(assets):
    total_net_worth = 0.0
    total_stock_value = 0.0
    total_property_value = 0.0
    total_profit_loss = 0.0
    by_asset_type = {}

    for a in assets:
        fetch_live = a.asset_type in ("stock", "mutual_fund")
        metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
        current_value = metrics["current_value"]

        total_net_worth += current_value
        total_profit_loss += metrics["profit"]
        if a.asset_type in ("stock", "mutual_fund"):
            total_stock_value += current_value
        if a.asset_type in ("real_estate", "metal"):
            total_property_value += current_value

        by_asset_type[a.asset_type] = by_asset_type.get(a.asset_type, 0.0) + current_value

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


def snapshot_all_users(snapshot_date: Optional[date] = None):
    """Compute and store one snapshot row per user with assets, and one per
    household with shared assets, for the given date (default: today)."""
    snapshot_date = snapshot_date or date.today()

    user_ids = [row[0] for row in db.session.query(Asset.user_id).distinct()]
    for user_id in user_ids:
        assets = Asset.query.filter_by(user_id=user_id).all()
        totals = _compute_totals(assets)
        _upsert_snapshot(user_id=user_id, household_id=None, snapshot_date=snapshot_date, totals=totals)

    household_ids = [
        row[0] for row in
        db.session.query(Asset.household_id).filter(Asset.household_id.isnot(None)).distinct()
    ]
    for household_id in household_ids:
        assets = Asset.query.filter_by(household_id=household_id).all()
        totals = _compute_totals(assets)
        _upsert_snapshot(user_id=None, household_id=household_id, snapshot_date=snapshot_date, totals=totals)

    db.session.commit()
    return {"users_snapshotted": len(user_ids), "households_snapshotted": len(household_ids)}
