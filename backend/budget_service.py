"""
Income/expense (Budget) aggregation. Deliberately independent of
holdings_service — this never touches net worth, so there's no
double-counting risk between "money you logged as spent" and "a cash
holding you track separately."
"""
from typing import Dict, List, Optional

from sqlalchemy import text

from . import sip_service
from .models import BudgetCategory, BudgetEntry, BudgetLimit, db

INCOME_CATEGORIES = ["paycheck", "bonus", "interest", "gift", "other_income"]
EXPENSE_CATEGORIES = [
    "housing", "food", "transport", "utilities", "healthcare",
    "entertainment", "shopping", "education", "insurance", "other_expense",
]

# Multiplier to normalize a recurring amount at this frequency to a
# monthly-equivalent figure, for the Subscriptions & Bills total.
_MONTHLY_EQUIVALENT = {"weekly": 52 / 12, "monthly": 1.0, "quarterly": 1 / 3, "yearly": 1 / 12}


def _scoped_query(user_id=None, household_id=None):
    if household_id:
        return BudgetEntry.query.filter_by(household_id=household_id, is_private=False)
    return BudgetEntry.query.filter_by(user_id=user_id)


def get_monthly_summary(user_id=None, household_id=None, months: int = 6, currency: str = "USD") -> Dict:
    """Income/expense/net per month for the trailing `months`, plus a
    category breakdown for the most recent month with any activity.
    Only sums entries in `currency` — entries logged in a different
    currency are reported separately in `other_currency_entries` rather
    than silently mixed into the total."""
    entries = _scoped_query(user_id, household_id).order_by(BudgetEntry.entry_date.asc()).all()
    limits = get_limits(user_id=user_id, household_id=household_id)
    result = summarize_entries(entries, months=months, currency=currency, limits=limits)
    if household_id and result["latest_month"]:
        result["by_member"] = get_member_breakdown(household_id, result["latest_month"], currency=currency)
    return result


def summarize_entries(entries: List[BudgetEntry], months: int = 6, currency: str = "USD", limits: Optional[List[Dict]] = None) -> Dict:
    """Pure aggregation over an already-fetched list of entries — split out
    from get_monthly_summary so it's testable without a real database.
    `limits` (BudgetLimit.to_dict()-shaped, already currency-independent
    since a limit is defined once per category) is optional so callers
    without any limits set don't need to pass anything."""
    matching = [e for e in entries if e.currency == currency]
    other_currency_count = len(entries) - len(matching)

    by_month: Dict[str, Dict] = {}
    for e in matching:
        key = e.entry_date.strftime("%Y-%m")
        bucket = by_month.setdefault(key, {"month": key, "income": 0.0, "expenses": 0.0})
        if e.entry_type == "income":
            bucket["income"] += e.amount
        else:
            bucket["expenses"] += e.amount

    ordered_months = sorted(by_month.keys())[-months:]
    month_rows = []
    for key in ordered_months:
        bucket = by_month[key]
        month_rows.append({
            "month": bucket["month"],
            "income": round(bucket["income"], 2),
            "expenses": round(bucket["expenses"], 2),
            "net": round(bucket["income"] - bucket["expenses"], 2),
        })

    latest_month = ordered_months[-1] if ordered_months else None
    category_breakdown = []
    if latest_month:
        by_category: Dict[str, float] = {}
        for e in matching:
            if e.entry_date.strftime("%Y-%m") != latest_month or e.entry_type != "expense":
                continue
            by_category[e.category] = by_category.get(e.category, 0.0) + e.amount
        category_breakdown = sorted(
            [{"category": k, "amount": round(v, 2)} for k, v in by_category.items()],
            key=lambda c: -c["amount"],
        )

    limit_status = []
    if latest_month and limits:
        spent_by_category = {c["category"]: c["amount"] for c in category_breakdown}
        for lim in limits:
            if lim["currency"] != currency:
                continue
            spent = spent_by_category.get(lim["category"], 0.0)
            limit_status.append({
                "category": lim["category"],
                "limit": lim["monthly_limit"],
                "spent": round(spent, 2),
                "percent": round((spent / lim["monthly_limit"]) * 100, 1) if lim["monthly_limit"] else 0.0,
            })
        limit_status.sort(key=lambda s: -s["percent"])

    return {
        "currency": currency,
        "months": month_rows,
        "latest_month": latest_month,
        "category_breakdown": category_breakdown,
        "other_currency_entries": other_currency_count,
        "limit_status": limit_status,
    }


def get_subscriptions(user_id=None, household_id=None, currency: str = "USD") -> Dict:
    """Fetches recurring entries in `currency` and hands them to
    summarize_subscriptions — split out so the grouping/math is testable
    without a real database, same reasoning as summarize_entries."""
    entries = (
        _scoped_query(user_id, household_id)
        .filter(BudgetEntry.is_recurring == True, BudgetEntry.currency == currency)  # noqa: E712
        .order_by(BudgetEntry.entry_date.asc())
        .all()
    )
    return summarize_subscriptions(entries, currency=currency)


def summarize_subscriptions(entries: List[BudgetEntry], currency: str = "USD") -> Dict:
    """Groups recurring entries by (category, description) and takes the
    most recent one in each group as the current amount/frequency — so
    logging this month's rent again just updates the existing subscription
    rather than creating a duplicate row in this view. Returns each item's
    next-due date (via sip_service's recurring-date math, shared with SIP
    holdings) and a monthly-normalized total across all of them. Assumes
    every entry passed in is already recurring and in `currency` — callers
    filter that at the query level (get_subscriptions) or the test level."""
    groups: Dict[tuple, BudgetEntry] = {}
    for e in sorted(entries, key=lambda e: e.entry_date):
        desc_key = (e.description or "").strip().lower()
        # An empty description isn't a real identifier -- grouping two
        # undescribed entries in the same category together (e.g. two
        # unrelated subscriptions both left blank) would silently merge
        # distinct subscriptions into one, dropping one of them from the
        # list and undercounting monthly_total. Falling back to amount
        # keeps the intended "re-logging the same subscription updates it
        # in place" behavior for described entries, while still telling
        # apart undescribed entries that are actually different amounts.
        key = (e.category, desc_key) if desc_key else (e.category, desc_key, e.amount)
        groups[key] = e  # ascending date order, so the last write per key is the most recent

    items = []
    monthly_total = 0.0
    for key, latest in groups.items():
        category = key[0]
        frequency = latest.recurring_frequency or "monthly"
        next_due_dates = sip_service.next_occurrences(latest.entry_date, frequency, count=1)
        monthly_equivalent = latest.amount * _MONTHLY_EQUIVALENT.get(frequency, 1.0)
        monthly_total += monthly_equivalent
        items.append({
            "category": category,
            "description": latest.description,
            "amount": round(latest.amount, 2),
            "frequency": frequency,
            "next_due": next_due_dates[0] if next_due_dates else None,
            "monthly_equivalent": round(monthly_equivalent, 2),
        })

    items.sort(key=lambda i: i["next_due"] or "9999-99-99")
    return {"currency": currency, "items": items, "monthly_total": round(monthly_total, 2)}


def get_limits(user_id=None, household_id=None) -> List[Dict]:
    if household_id:
        rows = BudgetLimit.query.filter_by(household_id=household_id).all()
    else:
        rows = BudgetLimit.query.filter_by(user_id=user_id, household_id=None).all()
    return [r.to_dict() for r in rows]


def set_limit(user_id, category: str, monthly_limit: float, currency: str, household_id=None) -> Dict:
    """Upserts by (user_id or household_id, category) — no DB-level unique
    constraint (household_id is nullable, which complicates a partial
    unique index for little benefit here), so this checks for an existing
    row first rather than relying on an ON CONFLICT clause."""
    if not category_exists(category, "expense", user_id, household_id):
        raise ValueError(f"'{category}' isn't a known expense category")
    if monthly_limit <= 0:
        raise ValueError("monthly_limit must be greater than 0")

    query = BudgetLimit.query.filter_by(category=category)
    query = query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)
    existing = query.first()

    if existing:
        existing.monthly_limit = monthly_limit
        existing.currency = currency
        limit = existing
    else:
        limit = BudgetLimit(user_id=user_id, household_id=household_id, category=category, monthly_limit=monthly_limit, currency=currency)
        db.session.add(limit)
    db.session.commit()
    return limit.to_dict()


def delete_limit(limit_id, user_id=None, household_id=None) -> bool:
    query = BudgetLimit.query.filter_by(id=limit_id)
    query = query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)
    limit = query.first()
    if not limit:
        return False
    db.session.delete(limit)
    db.session.commit()
    return True


def _custom_categories_query(entry_type, user_id, household_id=None):
    query = BudgetCategory.query.filter_by(entry_type=entry_type)
    return query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)


def list_categories(user_id, household_id=None) -> Dict[str, List[str]]:
    """The fixed presets plus any custom categories for this scope,
    in creation order after the presets -- matches how the Category
    dropdown is built (presets first, then whatever's been added)."""
    income_custom = [c.name for c in _custom_categories_query("income", user_id, household_id).order_by(BudgetCategory.created_at).all()]
    expense_custom = [c.name for c in _custom_categories_query("expense", user_id, household_id).order_by(BudgetCategory.created_at).all()]
    return {"income": INCOME_CATEGORIES + income_custom, "expense": EXPENSE_CATEGORIES + expense_custom}


def category_exists(category: str, entry_type: str, user_id, household_id=None) -> bool:
    """Whether `category` is usable for a new/updated entry -- either one
    of the fixed presets, or a custom category already created in this
    scope. Case-sensitive: a custom category's name is stored and matched
    verbatim, same as any other user-entered string in this app."""
    presets = INCOME_CATEGORIES if entry_type == "income" else EXPENSE_CATEGORIES
    if category in presets:
        return True
    return _custom_categories_query(entry_type, user_id, household_id).filter_by(name=category).first() is not None


def create_category(user_id, entry_type: str, name: str, household_id=None) -> Dict:
    if entry_type not in ("income", "expense"):
        raise ValueError("entry_type must be 'income' or 'expense'")
    name = (name or "").strip()
    if not name:
        raise ValueError("name is required")
    if len(name) > 64:
        raise ValueError("name must be 64 characters or fewer")

    presets = INCOME_CATEGORIES if entry_type == "income" else EXPENSE_CATEGORIES
    existing_names = {n.lower() for n in presets} | {
        c.name.lower() for c in _custom_categories_query(entry_type, user_id, household_id).all()
    }
    if name.lower() in existing_names:
        raise ValueError(f"'{name}' already exists")

    category = BudgetCategory(user_id=user_id, household_id=household_id, entry_type=entry_type, name=name)
    db.session.add(category)
    db.session.commit()
    return category.to_dict()


def delete_category(category_id, user_id=None, household_id=None) -> bool:
    """Deleting a category doesn't touch entries already using its name --
    they keep displaying it, same as deleting a holding doesn't rewrite
    its historical transactions. It just stops being offered for new ones."""
    query = BudgetCategory.query.filter_by(id=category_id)
    query = query.filter_by(household_id=household_id) if household_id else query.filter_by(user_id=user_id, household_id=None)
    category = query.first()
    if not category:
        return False
    db.session.delete(category)
    db.session.commit()
    return True


def get_member_breakdown(household_id, month: str, currency: str = "USD") -> List[Dict]:
    """Each household member's total expenses for `month` (YYYY-MM),
    joined against auth.users for display email — same join pattern as
    household_service.list_members_with_email. Private entries are
    excluded, matching how the rest of the household view already hides
    them."""
    rows = db.session.execute(
        text(
            """
            select be.user_id, au.email, sum(be.amount) as total
            from budget_entries be
            join auth.users au on au.id = be.user_id
            where be.household_id = :household_id
              and be.entry_type = 'expense'
              and be.currency = :currency
              and be.is_private = false
              and to_char(be.entry_date, 'YYYY-MM') = :month
            group by be.user_id, au.email
            order by total desc
            """
        ),
        {"household_id": str(household_id), "currency": currency, "month": month},
    ).mappings().all()
    return [{"user_id": str(r["user_id"]), "email": r["email"], "total": round(r["total"], 2)} for r in rows]
