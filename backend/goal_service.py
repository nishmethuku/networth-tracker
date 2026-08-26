"""
Net worth goals — a simple target amount (and optional target date) per
user, shown as a progress bar against the already-fetched current net
worth. No pace/required-rate projection lives here; that's the What-If
calculator's job, so a goal stays just a target rather than duplicating
that math.
"""
from datetime import date
from typing import Dict, List, Optional

from .models import Goal, db


def list_goals(user_id) -> List[Dict]:
    goals = Goal.query.filter_by(user_id=user_id).order_by(Goal.created_at.asc()).all()
    return [g.to_dict() for g in goals]


def create_goal(user_id, name: str, target_amount: float, currency: str, target_date: Optional[date]) -> Dict:
    if not name or not name.strip():
        raise ValueError("name is required")
    if target_amount <= 0:
        raise ValueError("target_amount must be positive")
    goal = Goal(
        user_id=user_id,
        name=name.strip(),
        target_amount=target_amount,
        currency=currency,
        target_date=target_date,
    )
    db.session.add(goal)
    db.session.commit()
    return goal.to_dict()


def update_goal(goal_id, user_id, **fields) -> Dict:
    goal = Goal.query.get_or_404(goal_id)
    if str(goal.user_id) != str(user_id):
        raise PermissionError("Not your goal")
    if "name" in fields:
        if not fields["name"] or not fields["name"].strip():
            raise ValueError("name is required")
        goal.name = fields["name"].strip()
    if "target_amount" in fields:
        if fields["target_amount"] <= 0:
            raise ValueError("target_amount must be positive")
        goal.target_amount = fields["target_amount"]
    if "currency" in fields:
        goal.currency = fields["currency"]
    if "target_date" in fields:
        goal.target_date = fields["target_date"]
    db.session.commit()
    return goal.to_dict()


def delete_goal(goal_id, user_id) -> None:
    goal = Goal.query.get_or_404(goal_id)
    if str(goal.user_id) != str(user_id):
        raise PermissionError("Not your goal")
    db.session.delete(goal)
    db.session.commit()
