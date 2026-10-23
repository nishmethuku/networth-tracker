"""
Income/expense (Budget) aggregation. Deliberately independent of
holdings_service — this never touches net worth, so there's no
double-counting risk between "money you logged as spent" and "a cash
holding you track separately."
"""
from datetime import date
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


# Expense categories that are card bill payments, not spending. The purchases on the card
# are already logged as expenses, so counting the payment too would count them twice.
# Matching ignores case, spaces, underscores and a trailing "s".
_NON_SPENDING_CATEGORIES = {"cc-payment", "credit-card-payment", "card-payment"}


def is_non_spending_category(category: str) -> bool:
    key = (category or "").strip().lower().replace("_", "-").replace(" ", "-")
    if key.endswith("s"):
        key = key[:-1]
    return key in _NON_SPENDING_CATEGORIES


def _scoped_query(user_id=None, household_id=None):
    if household_id:
        return BudgetEntry.query.filter_by(household_id=household_id, is_private=False)
    return BudgetEntry.query.filter_by(user_id=user_id)


def most_recent_entry_date(user_id=None, household_id=None):
    """The entry_date of the most recently logged entry in this scope
    (any currency), or None if nothing's ever been logged. Used to nudge
    a user who's used Budget before but has gone quiet -- deliberately
    not scoped by currency the way summarize_entries is, since "have they
    logged anything at all recently" shouldn't depend on which currency
    the page happens to be viewing."""
    latest = _scoped_query(user_id, household_id).order_by(BudgetEntry.entry_date.desc()).first()
    return latest.entry_date if latest else None


def get_monthly_summary(user_id=None, household_id=None, months: int = 6, currency: str = "USD") -> Dict:
    """Income/expense/net per month for the trailing `months`, plus a
    category breakdown for the most recent month with any activity.
    Only sums entries in `currency` — entries logged in a different
    currency are reported separately in `other_currency_entries` rather
    than silently mixed into the total."""
    entries = _scoped_query(user_id, household_id).order_by(BudgetEntry.entry_date.asc()).all()
    limits = get_limits(user_id=user_id, household_id=household_id)
    parents = {c.name: c.parent for c in _custom_categories_query("expense", user_id, household_id).all() if c.parent}
    result = summarize_entries(entries, months=months, currency=currency, limits=limits, parents=parents)
    if household_id and result["latest_month"]:
        result["by_member"] = get_member_breakdown(household_id, result["latest_month"], currency=currency)
    return result


def summarize_entries(
    entries: List[BudgetEntry],
    months: int = 6,
    currency: str = "USD",
    limits: Optional[List[Dict]] = None,
    parents: Optional[Dict[str, str]] = None,
) -> Dict:
    """Pure aggregation over an already-fetched list of entries — split out
    from get_monthly_summary so it's testable without a real database.
    `limits` (BudgetLimit.to_dict()-shaped, already currency-independent
    since a limit is defined once per category) is optional so callers
    without any limits set don't need to pass anything."""
    matching = [e for e in entries if e.currency == currency]
    other_currency_count = len(entries) - len(matching)
    # Card bill payments are neither spending nor income, so leave them out of every total.
    matching = [e for e in matching if not (e.entry_type == "expense" and is_non_spending_category(e.category))]

    by_month: Dict[str, Dict] = {}
    for e in matching:
        key = e.entry_date.strftime("%Y-%m")
        bucket = by_month.setdefault(key, {"month": key, "income": 0.0, "expenses": 0.0})
        if e.entry_type == "income":
            bucket["income"] += e.amount
        else:
            bucket["expenses"] += e.amount

    # A plain [-months:] slice misbehaves for non-positive months: with 0
    # it's [0:] (every month, not none), and with a negative value it
    # drops that many months off the *front* instead of returning fewer
    # from the back. months is client-controlled (?months= on
    # /budget/summary, unvalidated), so 0 or negative is reachable.
    ordered_months = sorted(by_month.keys())[-months:] if months > 0 else []
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
        parents = parents or {}
        category_breakdown = sorted(
            [
                {"category": k, "amount": round(v, 2), **({"parent": parents[k]} if k in parents else {})}
                for k, v in by_category.items()
            ],
            key=lambda c: -c["amount"],
        )

    limit_status = []
    if latest_month and limits:
        spent_by_category = {c["category"]: c["amount"] for c in category_breakdown}
        previous_month = _previous_month(latest_month)
        previous_spent: Dict[str, float] = {}
        for e in matching:
            if e.entry_type == "expense" and e.entry_date.strftime("%Y-%m") == previous_month:
                previous_spent[e.category] = previous_spent.get(e.category, 0.0) + e.amount
        for lim in limits:
            if lim["currency"] != currency:
                continue
            spent = spent_by_category.get(lim["category"], 0.0)
            carried = 0.0
            # Rollover adds last month's unspent amount (never more than one month's limit),
            # but only when last month actually has entries, so a gap in logging is not
            # mistaken for a month of saving.
            if lim.get("rollover") and previous_month in by_month:
                carried = min(lim["monthly_limit"], max(0.0, lim["monthly_limit"] - previous_spent.get(lim["category"], 0.0)))
            effective = lim["monthly_limit"] + carried
            limit_status.append({
                "category": lim["category"],
                "limit": effective,
                "base_limit": lim["monthly_limit"],
                "carried_over": round(carried, 2),
                "rollover": bool(lim.get("rollover")),
                "spent": round(spent, 2),
                "percent": round((spent / effective) * 100, 1) if effective else 0.0,
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


def set_limit(user_id, category: str, monthly_limit: float, currency: str, household_id=None, rollover: Optional[bool] = None) -> Dict:
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
        if rollover is not None:
            existing.rollover = rollover
        limit = existing
    else:
        limit = BudgetLimit(
            user_id=user_id, household_id=household_id, category=category, monthly_limit=monthly_limit,
            currency=currency, rollover=bool(rollover),
        )
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


def list_categories(user_id, household_id=None) -> Dict:
    """The fixed presets plus any custom categories for this scope,
    in creation order after the presets -- matches how the Category
    dropdown is built (presets first, then whatever's been added).
    `parents` maps a subcategory's name to the category it sits in."""
    income_rows = _custom_categories_query("income", user_id, household_id).order_by(BudgetCategory.created_at).all()
    expense_rows = _custom_categories_query("expense", user_id, household_id).order_by(BudgetCategory.created_at).all()
    return {
        "income": INCOME_CATEGORIES + [c.name for c in income_rows],
        "expense": EXPENSE_CATEGORIES + [c.name for c in expense_rows],
        "parents": {
            "income": {c.name: c.parent for c in income_rows if c.parent},
            "expense": {c.name: c.parent for c in expense_rows if c.parent},
        },
    }


def category_exists(category: str, entry_type: str, user_id, household_id=None) -> bool:
    """Whether `category` is usable for a new/updated entry -- either one
    of the fixed presets, or a custom category already created in this
    scope. Case-sensitive: a custom category's name is stored and matched
    verbatim, same as any other user-entered string in this app."""
    presets = INCOME_CATEGORIES if entry_type == "income" else EXPENSE_CATEGORIES
    if category in presets:
        return True
    if user_id is None and household_id is None:
        # No real scope to have created a custom category in -- skip the
        # DB round trip rather than querying a scope that can't match
        # anything (also keeps this callable in a pure/no-DB context,
        # e.g. a unit test asserting a category is rejected).
        return False
    return _custom_categories_query(entry_type, user_id, household_id).filter_by(name=category).first() is not None


def create_category(user_id, entry_type: str, name: str, household_id=None, parent: Optional[str] = None) -> Dict:
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

    parent = (parent or "").strip() or None
    if parent:
        if parent.lower() == name.lower():
            raise ValueError("A category cannot be inside itself")
        custom = {c.name: c for c in _custom_categories_query(entry_type, user_id, household_id).all()}
        if parent not in presets and parent not in custom:
            raise ValueError(f"'{parent}' isn't a known {entry_type} category")
        if parent in custom and custom[parent].parent:
            raise ValueError("Categories can only be nested one level deep")

    category = BudgetCategory(user_id=user_id, household_id=household_id, entry_type=entry_type, name=name, parent=parent)
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
    # Subcategories of a deleted category move up to the top level instead of disappearing.
    children = _custom_categories_query(category.entry_type, user_id, household_id).filter_by(parent=category.name).all()
    for child in children:
        child.parent = None
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


def _previous_month(month: str) -> str:
    year, mon = int(month[:4]), int(month[5:7])
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def summarize_year(entries: List[BudgetEntry], year: int, currency: str = "USD") -> Dict:
    """A calendar year of spending in one currency: each month, the total, the biggest
    categories, and how it compares with the year before. Card payments are left out.
    Pure, so it is testable without a database."""
    def counted(e):
        return e.currency == currency and not (e.entry_type == "expense" and is_non_spending_category(e.category))

    this_year = [e for e in entries if counted(e) and e.entry_date.year == year]
    last_year = [e for e in entries if counted(e) and e.entry_date.year == year - 1]

    months = []
    for m in range(1, 13):
        spent = sum(e.amount for e in this_year if e.entry_type == "expense" and e.entry_date.month == m)
        earned = sum(e.amount for e in this_year if e.entry_type == "income" and e.entry_date.month == m)
        months.append({"month": f"{year}-{m:02d}", "expenses": round(spent, 2), "income": round(earned, 2)})

    by_category: Dict[str, float] = {}
    for e in this_year:
        if e.entry_type == "expense":
            by_category[e.category] = by_category.get(e.category, 0.0) + e.amount
    top_categories = [
        {"category": c, "amount": round(a, 2)}
        for c, a in sorted(by_category.items(), key=lambda kv: -kv[1])[:8]
    ]

    total_spent = sum(m["expenses"] for m in months)
    total_income = sum(m["income"] for m in months)
    active = [m for m in months if m["expenses"] > 0]
    biggest = max(active, key=lambda m: m["expenses"]) if active else None
    last_total = sum(e.amount for e in last_year if e.entry_type == "expense")
    return {
        "year": year,
        "currency": currency,
        "months": months,
        "total_spent": round(total_spent, 2),
        "total_income": round(total_income, 2),
        "average_month": round(total_spent / len(active), 2) if active else 0.0,
        "biggest_month": biggest,
        "top_categories": top_categories,
        "last_year_spent": round(last_total, 2) if last_total > 0 else None,
    }


def get_year(user_id=None, household_id=None, year: Optional[int] = None, currency: str = "USD") -> Dict:
    year = year or date.today().year
    entries = (
        _scoped_query(user_id, household_id)
        .filter(BudgetEntry.entry_date >= date(year - 1, 1, 1), BudgetEntry.entry_date <= date(year, 12, 31))
        .all()
    )
    return summarize_year(entries, year, currency)


def plan_due_recurring(entries: List[BudgetEntry], today: date, max_per_item: int = 3) -> List[Dict]:
    """For each recurring bill (grouped like the Subscriptions view), the dates a new
    entry is due: one period after its latest entry, repeated to catch up, never past
    today. Returns [{source, entry_date}]. Pure, so it is testable without a database.
    Because each run starts from the latest entry, running it twice logs nothing new."""
    groups: Dict[tuple, BudgetEntry] = {}
    for e in sorted(entries, key=lambda e: e.entry_date):
        if not e.is_recurring or e.recurring_frequency not in sip_service.FREQUENCY_DAYS:
            continue
        desc = (e.description or "").strip().lower()
        key = (e.currency, e.entry_type, e.category, desc) if desc else (e.currency, e.entry_type, e.category, desc, e.amount)
        groups[key] = e

    plan = []
    for latest in groups.values():
        cursor = latest.entry_date
        for _ in range(max_per_item):
            due = sip_service._advance(cursor, latest.recurring_frequency, 1)
            if due > today:
                break
            plan.append({"source": latest, "entry_date": due})
            cursor = due
    return plan


def log_due_recurring(user_id, household_id=None, today: Optional[date] = None) -> List[BudgetEntry]:
    """Adds the recurring entries that have come due. Bills only: nothing here touches
    a card, loan or cash balance."""
    today = today or date.today()
    entries = _scoped_query(user_id if not household_id else None, household_id).filter(BudgetEntry.is_recurring == True).all()  # noqa: E712
    created = []
    for item in plan_due_recurring(entries, today):
        src = item["source"]
        entry = BudgetEntry(
            user_id=user_id,
            household_id=src.household_id,
            entry_type=src.entry_type,
            entry_date=item["entry_date"],
            amount=src.amount,
            currency=src.currency,
            category=src.category,
            description=src.description,
            is_private=src.is_private,
            is_recurring=True,
            recurring_frequency=src.recurring_frequency,
        )
        db.session.add(entry)
        created.append(entry)
    if created:
        db.session.commit()
    return created
