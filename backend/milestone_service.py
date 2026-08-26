"""
Net worth milestones — auto-detected from the daily snapshot job when a
user or household's net worth crosses a round threshold (e.g. $100,000),
not something created by hand. Snapshots are always stored in USD (see
snapshot_service.py), so thresholds are defined in USD too.

A user/household's very first snapshot backfills every threshold already
below their starting net worth silently (acknowledged=True, no
celebration) — those were reached before tracking started, so surfacing
them as a "just now" event would be misleading. Every threshold crossed by
a later snapshot is recorded unacknowledged, for the frontend to celebrate
once.
"""
from typing import List, Optional

from .models import Milestone, db

THRESHOLDS_USD = [
    10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
    1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
]


def detect_and_record_milestones(
    user_id, household_id, previous_net_worth: Optional[float], new_net_worth: float, snapshot_date
) -> List[Milestone]:
    if new_net_worth <= 0:
        return []

    is_first_snapshot = previous_net_worth is None
    baseline = 0.0 if is_first_snapshot else previous_net_worth
    crossed = [t for t in THRESHOLDS_USD if baseline < t <= new_net_worth]
    if not crossed:
        return []

    already_recorded = {
        m.threshold
        for m in Milestone.query.filter_by(user_id=user_id, household_id=household_id).all()
    }

    new_milestones = []
    for threshold in crossed:
        if threshold in already_recorded:
            continue
        milestone = Milestone(
            user_id=user_id,
            household_id=household_id,
            threshold=threshold,
            currency="USD",
            achieved_date=snapshot_date,
            acknowledged=is_first_snapshot,
        )
        db.session.add(milestone)
        new_milestones.append(milestone)

    return new_milestones


def list_milestones(user_id=None, household_id=None) -> List[dict]:
    query = Milestone.query.filter_by(household_id=household_id) if household_id else Milestone.query.filter_by(user_id=user_id)
    rows = query.order_by(Milestone.achieved_date.desc()).all()
    return [m.to_dict() for m in rows]
