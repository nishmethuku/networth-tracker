"""
Account name registry -- lets an account (a brokerage, a bank account, a
person's name) be pre-registered before any holding uses it, and lets an
empty one be deleted cleanly. Holding.account itself stays a plain string
either way (see Account's docstring in models.py); this is purely about
managing the *list* of known names, not a foreign key relationship.
"""
from typing import Dict, List

from .models import Account, Holding, db


def _registered_query(user_id, household_id=None):
    query = Account.query
    return query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)


def _holdings_query(user_id, household_id=None):
    query = Holding.query
    return query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)


def list_accounts(user_id, household_id=None) -> List[Dict]:
    """Every account name in this scope -- explicitly registered ones plus
    any name still used by a holding that was never formally registered
    (an old manually-typed or CSV-imported one). Registered accounts with
    no holdings can be deleted (id is a real row); names that only exist
    because a holding uses them can't (nothing to delete -- the "account"
    disappears on its own once the last holding using it is gone/renamed)."""
    registered = _registered_query(user_id, household_id).all()
    holdings = _holdings_query(user_id, household_id).all()

    holding_counts: Dict[str, int] = {}
    for h in holdings:
        if h.account:
            holding_counts[h.account] = holding_counts.get(h.account, 0) + 1

    by_name: Dict[str, Dict] = {}
    for acc in registered:
        by_name[acc.name] = {"id": acc.id, "name": acc.name, "holding_count": holding_counts.get(acc.name, 0)}
    for name, count in holding_counts.items():
        if name not in by_name:
            by_name[name] = {"id": None, "name": name, "holding_count": count}

    return sorted(by_name.values(), key=lambda a: a["name"].lower())


def create_account(user_id, name: str, household_id=None) -> Dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("name is required")
    if len(name) > 64:
        raise ValueError("name must be 64 characters or fewer")

    existing_names = {a["name"].lower() for a in list_accounts(user_id, household_id)}
    if name.lower() in existing_names:
        raise ValueError(f"'{name}' already exists")

    account = Account(user_id=user_id, household_id=household_id, name=name)
    db.session.add(account)
    db.session.commit()
    return account.to_dict()


def delete_account(account_id, user_id=None, household_id=None) -> bool:
    query = Account.query.filter_by(id=account_id)
    query = query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)
    account = query.first()
    if not account:
        return False

    in_use = _holdings_query(user_id, household_id).filter_by(account=account.name).first() is not None
    if in_use:
        raise ValueError(f"'{account.name}' still has holdings -- move or delete those first")

    db.session.delete(account)
    db.session.commit()
    return True
