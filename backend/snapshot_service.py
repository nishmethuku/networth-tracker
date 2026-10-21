"""
Daily net worth snapshot computation. Called by the /internal/snapshot
endpoint, which a scheduled job (GitHub Actions cron) hits once a day.
Upserts so a manual re-run for the same day is safe.
"""
import logging
from datetime import date
from typing import Optional

from .holdings_service import QUANTITY_BASED_TYPES, list_holdings_with_metrics
from .liability_service import total_liabilities_display
from .milestone_service import detect_and_record_milestones
from .models import Holding, HoldingTransaction, Liability, NetWorthSnapshot, db

logger = logging.getLogger(__name__)

# How far the net worth may drop (fraction) before the snapshot is refused
# unless sell transactions since the last snapshot can account for it.
DROP_GUARD_THRESHOLD = 0.30


def _compute_totals_from_metrics(holdings_with_metrics, liabilities):
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

        # display_-prefixed fields, not the bare native-currency ones -- a
        # snapshot spans every holding regardless of currency, so summing
        # "total_gain"/"gain" directly would add e.g. USD and INR gains
        # together as if they were the same unit (same bug class
        # build_dashboard already guards against for realized/unrealized
        # gain; this summed the un-converted figures instead).
        if h["asset_type"] in QUANTITY_BASED_TYPES:
            total_profit_loss += (h.get("display_realized_gain") or 0.0) + (h.get("display_unrealized_gain") or 0.0)
        else:
            total_profit_loss += current_value - (h.get("display_first_value") or 0.0)

        by_asset_type[h["asset_type"]] = by_asset_type.get(h["asset_type"], 0.0) + current_value

    total_liabilities_val = total_liabilities_display(liabilities, display_currency="USD")

    return {
        "total_net_worth": round(total_assets - total_liabilities_val, 2),
        "total_stock_value": round(total_stock_value, 2),
        "total_property_value": round(total_property_value, 2),
        "total_profit_loss": round(total_profit_loss, 2),
        "total_liabilities": total_liabilities_val,
        "by_asset_type": {k: round(v, 2) for k, v in by_asset_type.items()},
    }


def _compute_totals(holdings, liabilities):
    holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")
    return _compute_totals_from_metrics(holdings_with_metrics, liabilities)


class SnapshotRefusedError(Exception):
    """Raised when the guard refuses to save a snapshot."""


def _sell_proceeds_since(holdings, since_date):
    """Sum of sell transaction amounts (qty × price, un-converted) since since_date."""
    holding_ids = [h.id for h in holdings]
    if not holding_ids:
        return 0.0
    txs = HoldingTransaction.query.filter(
        HoldingTransaction.holding_id.in_(holding_ids),
        HoldingTransaction.transaction_type == "sell",
        HoldingTransaction.transaction_date >= since_date,
        HoldingTransaction.deleted_at.is_(None),
    ).all()
    return sum(t.quantity * t.price_per_unit for t in txs)


def _last_snapshot_date(snapshot_date):
    """Date of the most recent snapshot before snapshot_date, or date.min."""
    row = (
        NetWorthSnapshot.query
        .filter(NetWorthSnapshot.snapshot_date < snapshot_date)
        .filter(NetWorthSnapshot.user_id.isnot(None))
        .order_by(NetWorthSnapshot.snapshot_date.desc())
        .first()
    )
    return row.snapshot_date if row else date.min


def _validate_snapshot(holdings_with_metrics, holdings, previous_net_worth, new_net_worth, snapshot_date,
                       *, _sell_proceeds_fn=None, _last_snap_date_fn=None):
    """Raises SnapshotRefusedError if:
    - Any quantity-based holding with a live position has a zero display value
      (indicates a price fetch failure rather than a genuinely worthless holding).
    - Net worth dropped more than DROP_GUARD_THRESHOLD from the previous snapshot
      and no sell transactions since then can account for the drop.

    _sell_proceeds_fn and _last_snap_date_fn are injectable for unit tests only.
    """
    # Missing-price check: quantity-based holding with net qty > 0 but $0 value
    missing_price = []
    for h in holdings_with_metrics:
        if h.get("asset_type") not in QUANTITY_BASED_TYPES:
            continue
        if (h.get("net_quantity") or 0) > 0 and (h.get("display_value") or 0) == 0:
            missing_price.append(h.get("name") or h.get("symbol") or str(h.get("id")))
    if missing_price:
        raise SnapshotRefusedError(
            f"Price missing for {len(missing_price)} holding(s): {missing_price}. "
            "Snapshot refused to avoid recording a misleadingly low net worth."
        )

    # 30 % drop guard
    if previous_net_worth and previous_net_worth > 0:
        drop_frac = (previous_net_worth - new_net_worth) / previous_net_worth
        if drop_frac > DROP_GUARD_THRESHOLD:
            get_since = _last_snap_date_fn or _last_snapshot_date
            get_proceeds = _sell_proceeds_fn or _sell_proceeds_since
            since_date = get_since(snapshot_date)
            sell_proceeds = get_proceeds(holdings, since_date)
            drop_usd = previous_net_worth - new_net_worth
            if sell_proceeds < drop_usd * 0.5:
                raise SnapshotRefusedError(
                    f"Net worth dropped {drop_frac * 100:.1f}% "
                    f"(from ${previous_net_worth:,.0f} to ${new_net_worth:,.0f}) "
                    f"but only ${sell_proceeds:,.0f} in sell transactions since {since_date}. "
                    "Snapshot refused. Verify prices, then trigger manually."
                )


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
    household with shared holdings, for the given date (default: today).

    Each user/household is committed independently and a failure is caught,
    logged, and skipped rather than left to propagate -- previously one bad
    row anywhere (e.g. a Liability/BudgetEntry left behind by a deleted auth
    user, which cascades to nothing since these tables have no DB-level FK
    cascade -- see account_service.py's export/delete-all-data path, which
    exists partly to avoid exactly this) aborted the single shared
    transaction this ran in, silently failing the *entire* day's snapshot
    for every real user, not just the one with bad data. Caught live: five
    straight days of scheduled runs failing on one orphaned test Liability
    row with no matching auth.users entry."""
    snapshot_date = snapshot_date or date.today()

    user_ids = {row[0] for row in db.session.query(Holding.user_id).distinct()}
    user_ids |= {row[0] for row in db.session.query(Liability.user_id).distinct()}
    users_snapshotted = 0
    failed_scopes = []
    for user_id in user_ids:
        try:
            holdings = Holding.query.filter_by(user_id=user_id).filter(Holding.deleted_at.is_(None)).all()
            liabilities = Liability.query.filter_by(user_id=user_id).all()
            holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")
            totals = _compute_totals_from_metrics(holdings_with_metrics, liabilities)
            previous_net_worth = _previous_net_worth(user_id, None, snapshot_date)
            _validate_snapshot(holdings_with_metrics, holdings, previous_net_worth, totals["total_net_worth"], snapshot_date)
            _upsert_snapshot(user_id=user_id, household_id=None, snapshot_date=snapshot_date, totals=totals)
            detect_and_record_milestones(user_id, None, previous_net_worth, totals["total_net_worth"], snapshot_date)
            db.session.commit()
            users_snapshotted += 1
        except SnapshotRefusedError as e:
            db.session.rollback()
            logger.error("Snapshot refused for user %s: %s", user_id, e)
            failed_scopes.append(f"user:{user_id}:refused:{e}")
        except Exception:
            db.session.rollback()
            logger.exception("Daily snapshot failed for user %s", user_id)
            failed_scopes.append(f"user:{user_id}")

    household_ids = {
        row[0] for row in
        db.session.query(Holding.household_id).filter(Holding.household_id.isnot(None)).distinct()
    }
    household_ids |= {
        row[0] for row in
        db.session.query(Liability.household_id).filter(Liability.household_id.isnot(None)).distinct()
    }
    households_snapshotted = 0
    for household_id in household_ids:
        try:
            holdings = Holding.query.filter_by(household_id=household_id, is_private=False).filter(Holding.deleted_at.is_(None)).all()
            liabilities = Liability.query.filter_by(household_id=household_id, is_private=False).all()
            holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency="USD")
            totals = _compute_totals_from_metrics(holdings_with_metrics, liabilities)
            previous_net_worth = _previous_net_worth(None, household_id, snapshot_date)
            _validate_snapshot(holdings_with_metrics, holdings, previous_net_worth, totals["total_net_worth"], snapshot_date)
            _upsert_snapshot(user_id=None, household_id=household_id, snapshot_date=snapshot_date, totals=totals)
            detect_and_record_milestones(None, household_id, previous_net_worth, totals["total_net_worth"], snapshot_date)
            db.session.commit()
            households_snapshotted += 1
        except SnapshotRefusedError as e:
            db.session.rollback()
            logger.error("Snapshot refused for household %s: %s", household_id, e)
            failed_scopes.append(f"household:{household_id}:refused:{e}")
        except Exception:
            db.session.rollback()
            logger.exception("Daily snapshot failed for household %s", household_id)
            failed_scopes.append(f"household:{household_id}")

    return {"users_snapshotted": users_snapshotted, "households_snapshotted": households_snapshotted, "failed": failed_scopes}
