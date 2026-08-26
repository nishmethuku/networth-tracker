"""
Household CRUD and membership logic.
Kept separate from app.py per the existing convention: routes stay thin,
business logic lives in a service module.
"""
from typing import List, Optional

from sqlalchemy import text

from .models import (
    BudgetEntry,
    BudgetLimit,
    Holding,
    Household,
    HouseholdInvite,
    HouseholdMember,
    Liability,
    Milestone,
    NetWorthSnapshot,
    db,
)


def get_member_household_ids(user_id) -> List[str]:
    rows = HouseholdMember.query.filter_by(user_id=user_id).all()
    return [str(r.household_id) for r in rows]


def get_role(household_id, user_id) -> Optional[str]:
    """The caller's role in a household ('owner'/'editor'/'viewer'), or None
    if they're not a member at all."""
    member = HouseholdMember.query.filter_by(household_id=household_id, user_id=user_id).first()
    return member.role if member else None


def can_edit_household(household_id, user_id) -> bool:
    return get_role(household_id, user_id) in ("owner", "editor")


def list_members_with_email(household_id) -> List[dict]:
    """Household membership joined against auth.users for display purposes.
    Flask connects with a service-role/direct Postgres connection, so it can
    read auth.users directly — no separate profiles table needed."""
    rows = db.session.execute(
        text(
            """
            select hm.household_id, hm.user_id, hm.role, hm.joined_at, au.email
            from household_members hm
            join auth.users au on au.id = hm.user_id
            where hm.household_id = :household_id
            order by hm.joined_at asc
            """
        ),
        {"household_id": str(household_id)},
    ).mappings().all()
    return [
        {
            "household_id": str(r["household_id"]),
            "user_id": str(r["user_id"]),
            "role": r["role"],
            "joined_at": r["joined_at"].isoformat() if r["joined_at"] else None,
            "email": r["email"],
        }
        for r in rows
    ]


def create_household(owner_id, name) -> Household:
    household = Household(name=name, owner_id=owner_id)
    db.session.add(household)
    # A DB trigger (households_add_owner_as_member) auto-adds the owner to
    # household_members on insert, so we don't duplicate that here.
    db.session.commit()
    return household


def list_my_households(user_id) -> List[Household]:
    ids = get_member_household_ids(user_id)
    if not ids:
        return []
    return Household.query.filter(Household.id.in_(ids)).all()


def list_members(household_id) -> List[HouseholdMember]:
    return HouseholdMember.query.filter_by(household_id=household_id).all()


def create_invite(household_id, invited_by, invited_email, role="editor") -> HouseholdInvite:
    if role not in ("editor", "viewer"):
        raise ValueError("role must be 'editor' or 'viewer'")
    invite = HouseholdInvite(
        household_id=household_id,
        invited_by=invited_by,
        invited_email=invited_email.lower().strip(),
        role=role,
    )
    db.session.add(invite)
    db.session.commit()
    return invite


def list_my_pending_invites(user_email) -> List[HouseholdInvite]:
    return HouseholdInvite.query.filter_by(
        invited_email=(user_email or "").lower().strip(), status="pending"
    ).all()


def accept_invite(invite_id, user_id, user_email) -> HouseholdInvite:
    invite = HouseholdInvite.query.get(invite_id)
    if not invite:
        raise ValueError("Invite not found")
    if invite.status != "pending":
        raise ValueError("Invite is no longer pending")
    if invite.invited_email.lower() != (user_email or "").lower():
        raise PermissionError("This invite was sent to a different email address")

    member = HouseholdMember(household_id=invite.household_id, user_id=user_id, role=invite.role)
    db.session.merge(member)
    invite.status = "accepted"
    db.session.commit()
    return invite


def leave_household(household_id, user_id):
    household = Household.query.get(household_id)
    if household and str(household.owner_id) == str(user_id):
        raise PermissionError("The owner can't leave their own household — delete it instead")
    HouseholdMember.query.filter_by(household_id=household_id, user_id=user_id).delete()
    db.session.commit()


def delete_household(household_id, requester_id):
    """Owner-only. Deleting a household never deletes anyone's financial
    data — every record shared into it (holdings, snapshots, budget
    entries, budget limits, liabilities, milestones) just gets unshared
    (household_id -> NULL) and reverts to being that member's private
    data, matching how sharing already works everywhere else in the app."""
    household = Household.query.get(household_id)
    if not household:
        raise ValueError("Household not found")
    if str(household.owner_id) != str(requester_id):
        raise PermissionError("Only the household owner can delete the household")

    for model in (Holding, NetWorthSnapshot, BudgetEntry, BudgetLimit, Liability, Milestone):
        model.query.filter_by(household_id=household_id).update({"household_id": None})
    HouseholdInvite.query.filter_by(household_id=household_id).delete()
    HouseholdMember.query.filter_by(household_id=household_id).delete()
    db.session.delete(household)
    db.session.commit()


def remove_member(household_id, requester_id, target_user_id):
    household = Household.query.get(household_id)
    if not household or str(household.owner_id) != str(requester_id):
        raise PermissionError("Only the household owner can remove members")
    if str(target_user_id) == str(household.owner_id):
        raise PermissionError("Can't remove the owner")
    HouseholdMember.query.filter_by(household_id=household_id, user_id=target_user_id).delete()
    db.session.commit()
