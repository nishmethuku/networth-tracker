"""
Saved target allocation per user (from the Allocation Advisor's "Save as
my target" button) — lets drift be checked on demand without re-entering
targets every time. Kept separate from allocation_service.py, which stays
pure rebalance math with no DB access.
"""
from typing import Dict

from .models import db, AllocationTarget


def get_target_allocation(user_id) -> Dict[str, float]:
    rows = AllocationTarget.query.filter_by(user_id=user_id).all()
    return {r.asset_type: r.target_pct for r in rows}


def save_target_allocation(user_id, target_allocation: Dict[str, float]) -> Dict[str, float]:
    """Replaces the user's entire saved target allocation with the given one."""
    AllocationTarget.query.filter_by(user_id=user_id).delete()
    for asset_type, pct in target_allocation.items():
        db.session.add(AllocationTarget(user_id=user_id, asset_type=asset_type, target_pct=pct))
    db.session.commit()
    return target_allocation


def clear_target_allocation(user_id) -> None:
    AllocationTarget.query.filter_by(user_id=user_id).delete()
    db.session.commit()
