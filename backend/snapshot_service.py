"""
Daily net worth snapshot computation. Called by the /internal/snapshot
endpoint, which a scheduled job (GitHub Actions cron) hits once a day.
Upserts so a manual re-run for the same day is safe.
"""
from datetime import date
from typing import Optional

from .models import db, Holding, Liability, NetWorthSnapshot
from .holdings_service import list_holdings_with_metrics, QUANTITY_BASED_TYPES
from .liability_service import total_liabilities_display
from .milestone_service import detect_and_record_milestones


def _compute_totals(holdings, liabilities):
    holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")

    total_assets = 0.0
    total_stock_value = 0.0
    total_property_value = 0.0
    total_profit_loss = 0.0
    by_asset_type = {}

    for h in holdings_with_metrics:
        current_value = h["display_value"]
        total_assets += current_value

        if h["asset_type"] in ("stock", "mutual_fund"):
            total_stock_value += current_value
        if h["asset_type"] == "real_estate":
            total_property_value += current_value

        if h["asset_type"] in QUANTITY_BASED_TYPES:
            total_profit_loss += h.get("total_gain", 0.0)
        else:
            total_profit_loss += h.get("gain", 0.0)

        by_asset_type[h["asset_type"]] = by_asset_type.get(h["asset_type"], 0.0) + current_value

    total_liabilities = total_liabilities_display(liabilities, display_currency="USD")

    return {
        "total_net_worth": round(total_assets - total_liabilities, 2),
        "total_stock_value": round(total_stock_value, 2),
        "total_property_value": round(total_property_value, 2),
        "total_profit_loss": round(total_profit_loss, 2),
        "total_liabilities": total_liabilities,
        "by_asset_type": {k: round(v, 2) for k, v in by_asset_type.items()},
    }


def _previous_net_worth(user_id, household_id, before_date):
    query = NetWorthSnapshot.query.filter(NetWorthSnapshot.snapshot_date < before_date)
    query = query.filter_by(user_id=user_id) if user_id is not None else query.filter_by(household_id=household_id)
    row = query.order_by(NetWorthSnapshot.snapshot_date.desc()).first()
    return row.total_net_worth if row else None


def _upsert_snapshot(user_id, household_id, snapshot_date, totals):
    query = NetWorthSnapshot.query.filter_by(snapshot_date=snapshot_date)
    query = query.filter_by(user_id=user_id) if user_id is not None else query.filter_by(household_id=household_id)
    existing = query.first()

    if existing:
        existing.total_net_worth = totals["total_net_worth"]
        existing.total_stock_value = totals["total_stock_value"]
        existing.total_property_value = totals["total_property_value"]
        existing.total_profit_loss = totals["total_profit_loss"]
        existing.total_liabilities = totals["total_liabilities"]
        existing.by_asset_type = totals["by_asset_type"]
    else:
        db.session.add(NetWorthSnapshot(
            user_id=user_id,
            household_id=household_id,
            snapshot_date=snapshot_date,
            **totals,
        ))


def snapshot_all_users(snapshot_date: Optional[date] = None):
    """Compute and store one snapshot row per user with holdings, and one per
    household with shared holdings, for the given date (default: today)."""
    snapshot_date = snapshot_date or date.today()

    user_ids = {row[0] for row in db.session.query(Holding.user_id).distinct()}
    user_ids |= {row[0] for row in db.session.query(Liability.user_id).distinct()}
    for user_id in user_ids:
        holdings = Holding.query.filter_by(user_id=user_id).all()
        liabilities = Liability.query.filter_by(user_id=user_id).all()
        totals = _compute_totals(holdings, liabilities)
        previous_net_worth = _previous_net_worth(user_id, None, snapshot_date)
        _upsert_snapshot(user_id=user_id, household_id=None, snapshot_date=snapshot_date, totals=totals)
        detect_and_record_milestones(user_id, None, previous_net_worth, totals["total_net_worth"], snapshot_date)

    household_ids = {
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    }
    household_ids |= {
        row[0] for row in
        db.session.query(Liability.household_id).filter(Liability.household_id.isnot(None)).distinct()
    }
    for household_id in household_ids:
        holdings = Holding.query.filter_by(household_id=household_id, is_private=False).all()
        liabilities = Liability.query.filter_by(household_id=household_id, is_private=False).all()
        totals = _compute_totals(holdings, liabilities)
        previous_net_worth = _previous_net_worth(None, household_id, snapshot_date)
        _upsert_snapshot(user_id=None, household_id=household_id, snapshot_date=snapshot_date, totals=totals)
        detect_and_record_milestones(None, household_id, previous_net_worth, totals["total_net_worth"], snapshot_date)

    db.session.commit()
    return {"users_snapshotted": len(user_ids), "households_snapshotted": len(household_ids)}
