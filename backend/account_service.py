"""
Self-service data export and data deletion for the Settings page's Danger
Zone. Scoped to data the caller owns (Holding.user_id) — shared household
holdings owned by someone else are untouched even if visible to this user.

Deletion here removes financial data only (holdings, transactions,
valuations, alerts, milestones, net worth snapshots) via the existing
Postgres cascade FKs — it does not delete the Supabase auth account
itself, which needs the service-role Admin API and is out of scope for
now.
"""
import csv
import io
import os
import zipfile
from datetime import date
from typing import Dict

import requests

from .models import (
    Account,
    AllocationTarget,
    AuditEvent,
    BudgetCategory,
    BudgetEntry,
    BudgetLimit,
    Goal,
    Holding,
    HoldingTransaction,
    HoldingValuation,
    Liability,
    LinkedConnection,
    Milestone,
    NetWorthSnapshot,
    PriceAlert,
    PushSubscription,
    db,
)
from .services import safe_float


def export_user_data(user_id) -> Dict:
    holdings = Holding.query.filter_by(user_id=user_id).filter(Holding.deleted_at.is_(None)).all()
    holding_ids = [h.id for h in holdings]

    transactions = (
        HoldingTransaction.query.filter(
            HoldingTransaction.holding_id.in_(holding_ids),
            HoldingTransaction.deleted_at.is_(None),
        ).all()
        if holding_ids
        else []
    )
    valuations = (
        HoldingValuation.query.filter(HoldingValuation.holding_id.in_(holding_ids)).all()
        if holding_ids
        else []
    )
    alerts = PriceAlert.query.filter_by(user_id=user_id).all()
    milestones = Milestone.query.filter_by(user_id=user_id).all()
    snapshots = NetWorthSnapshot.query.filter_by(user_id=user_id).all()
    budget_entries = BudgetEntry.query.filter_by(user_id=user_id).all()
    budget_limits = BudgetLimit.query.filter_by(user_id=user_id).all()
    budget_categories = BudgetCategory.query.filter_by(user_id=user_id).all()
    accounts = Account.query.filter_by(user_id=user_id).all()
    liabilities = Liability.query.filter_by(user_id=user_id).all()
    goals = Goal.query.filter_by(user_id=user_id).all()
    allocation_targets = AllocationTarget.query.filter_by(user_id=user_id).all()
    push_subscriptions = PushSubscription.query.filter_by(user_id=user_id).all()
    # Which banks are linked (never the stored tokens: to_dict leaves them out).
    linked_connections = LinkedConnection.query.filter_by(user_id=user_id).all()
    security_activity = sorted(AuditEvent.query.filter_by(user_id=user_id).all(), key=lambda e: e.created_at)

    return {
        "holdings": [h.to_dict() for h in holdings],
        "linked_connections": [c.to_dict() for c in linked_connections],
        "security_activity": [e.to_dict() for e in security_activity],
        "transactions": [t.to_dict() for t in transactions],
        "valuations": [v.to_dict() for v in valuations],
        "alerts": [a.to_dict() for a in alerts],
        "milestones": [m.to_dict() for m in milestones],
        "net_worth_snapshots": [s.to_dict() for s in snapshots],
        "accounts": [a.to_dict() for a in accounts],
        "budget_entries": [e.to_dict() for e in budget_entries],
        "budget_limits": [limit.to_dict() for limit in budget_limits],
        "budget_categories": [c.to_dict() for c in budget_categories],
        "liabilities": [liability.to_dict() for liability in liabilities],
        "goals": [g.to_dict() for g in goals],
        "allocation_targets": [t.to_dict() for t in allocation_targets],
        "push_subscriptions": [p.to_dict() for p in push_subscriptions],
    }


def _write_csv(rows) -> str:
    """Rows -> CSV text using the union of keys across all rows as the header,
    since e.g. a stock holding and a cash holding don't share every field."""
    if not rows:
        return ""
    fieldnames = []
    seen = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def export_user_data_csv_zip(user_id) -> bytes:
    """Same data as export_user_data, as a zip of one CSV per table — a
    human-readable backup that opens directly in Excel/Sheets, in case the
    account or its data is ever lost."""
    data = export_user_data(user_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows in data.items():
            zf.writestr(f"{name}.csv", _write_csv(rows))
    return buf.getvalue()


def delete_all_user_data(user_id) -> Dict:
    """Deletes every holding this user owns (transactions/valuations cascade
    via the DB's own ON DELETE CASCADE foreign keys — see
    supabase/migrations/0002_holdings.sql), plus their alerts, personal
    milestones, liabilities, goals, allocation targets, budget entries,
    budget limits, budget categories, and push subscriptions — every table
    export_user_data() reports, so "delete all my data" actually leaves
    nothing behind. Returns a count summary for the confirmation UI."""
    holdings = Holding.query.filter_by(user_id=user_id).all()
    holdings_count = len(holdings)

    for holding in holdings:
        db.session.delete(holding)

    alerts_count = PriceAlert.query.filter_by(user_id=user_id).delete()
    milestones_count = Milestone.query.filter_by(user_id=user_id).delete()
    # Without this, a fresh holding added after "delete all my data" would
    # have its net worth history chart mixed with pre-wipe snapshot rows
    # that were never actually cleared.
    snapshots_count = NetWorthSnapshot.query.filter_by(user_id=user_id).delete()
    liabilities_count = Liability.query.filter_by(user_id=user_id).delete()
    goals_count = Goal.query.filter_by(user_id=user_id).delete()
    allocation_targets_count = AllocationTarget.query.filter_by(user_id=user_id).delete()
    budget_entries_count = BudgetEntry.query.filter_by(user_id=user_id).delete()
    budget_limits_count = BudgetLimit.query.filter_by(user_id=user_id).delete()
    budget_categories_count = BudgetCategory.query.filter_by(user_id=user_id).delete()
    accounts_count = Account.query.filter_by(user_id=user_id).delete()
    # No DB-level FK to anything that cascades here (push_subscriptions
    # only has a bare user_id, same as alerts/milestones above) -- without
    # this, deleting the account would leave a device still subscribed to
    # push notifications for a user that no longer exists.
    push_subscriptions_count = PushSubscription.query.filter_by(user_id=user_id).delete()
    # Linked banks go too, so no provider token outlives the account.
    linked_connections_count = LinkedConnection.query.filter_by(user_id=user_id).delete()
    # The security log is the person's own data too. The route records a fresh
    # "deleted all your data" entry after this, so the wipe itself stays visible.
    security_activity_count = AuditEvent.query.filter_by(user_id=user_id).delete()

    db.session.commit()

    return {
        "holdings_deleted": holdings_count,
        "alerts_deleted": alerts_count,
        "milestones_deleted": milestones_count,
        "net_worth_snapshots_deleted": snapshots_count,
        "accounts_deleted": accounts_count,
        "liabilities_deleted": liabilities_count,
        "goals_deleted": goals_count,
        "allocation_targets_deleted": allocation_targets_count,
        "budget_entries_deleted": budget_entries_count,
        "budget_limits_deleted": budget_limits_count,
        "budget_categories_deleted": budget_categories_count,
        "push_subscriptions_deleted": push_subscriptions_count,
        "linked_connections_deleted": linked_connections_count,
        "security_activity_deleted": security_activity_count,
    }


def _parse_date(value):
    return date.fromisoformat(value) if value else None


def restore_user_data(user_id, data: Dict) -> Dict:
    """Re-creates rows from an export_user_data()-shaped dict (the JSON
    backup from Settings) into this user's own personal data -- the
    reverse of export_user_data, for recovering from an accidental
    delete or moving data into a fresh account.

    Every row lands as *personal* data for `user_id`, regardless of
    whatever user_id/household_id is in the uploaded file: trusting an
    uploaded file's own user_id would let someone "restore" data as if
    it were their own, and re-associating with a household this user may
    not even belong to (or that no longer exists) isn't safe to infer
    from a file. Re-share into a household afterward the normal way if
    that's wanted.

    IDs in the file are the *old* database's row ids, which may already
    be in use by other data created since the export -- every row is
    inserted fresh (a new auto-generated id) rather than reusing the
    exported one, and holdings/liabilities are restored first so their
    new ids can be substituted into whatever referenced the old ones
    (transactions/valuations/alerts' holding_id, budget entries' linked_
    liability_id/deposit_target_holding_id). A row missing a field its
    model requires is skipped (counted, not raised) rather than failing
    the whole restore over one bad row. push_subscriptions is
    deliberately never restored -- a device's push subscription belongs
    to that device/browser, not to "the data," and is re-created by
    enabling push again if wanted.

    Commits once at the end; the caller's session is left mid-transaction
    on any unexpected error (same as every other write route here, which
    relies on Flask's error handler / the next request's own rollback)."""
    skipped: Dict[str, int] = {}

    def _skip(table):
        skipped[table] = skipped.get(table, 0) + 1

    holding_id_map: Dict[int, int] = {}
    holdings_restored = 0
    for row in data.get("holdings", []):
        if not all(row.get(f) for f in ("asset_type", "name", "country", "account", "currency")):
            _skip("holdings")
            continue
        holding = Holding(
            user_id=user_id,
            household_id=None,
            asset_type=row["asset_type"],
            symbol=row.get("symbol"),
            name=row["name"],
            country=row["country"],
            account=row["account"],
            institution=row.get("institution"),
            currency=row["currency"],
            interest_rate=row.get("interest_rate"),
            maturity_date=_parse_date(row.get("maturity_date")),
            sip_amount=row.get("sip_amount"),
            sip_frequency=row.get("sip_frequency"),
            sip_start_date=_parse_date(row.get("sip_start_date")),
            is_private=bool(row.get("is_private", False)),
            notes=row.get("notes"),
            tags=row.get("tags"),
            status=row.get("status", "active"),
        )
        db.session.add(holding)
        db.session.flush()  # assigns holding.id, needed by transactions/valuations below
        if row.get("id") is not None:
            holding_id_map[row["id"]] = holding.id
        holdings_restored += 1

    transactions_restored = 0
    for row in data.get("transactions", []):
        new_holding_id = holding_id_map.get(row.get("holding_id"))
        if not new_holding_id or not row.get("transaction_date") or row.get("quantity") is None or row.get("price_per_unit") is None:
            _skip("transactions")
            continue
        db.session.add(HoldingTransaction(
            holding_id=new_holding_id,
            user_id=user_id,
            transaction_type=row.get("transaction_type", "buy"),
            transaction_date=_parse_date(row["transaction_date"]),
            quantity=safe_float(row["quantity"]),
            price_per_unit=safe_float(row["price_per_unit"]),
            currency=row.get("currency", "USD"),
            fees=safe_float(row.get("fees", 0)),
            notes=row.get("notes"),
            tags=row.get("tags") or [],
        ))
        transactions_restored += 1

    valuations_restored = 0
    for row in data.get("valuations", []):
        new_holding_id = holding_id_map.get(row.get("holding_id"))
        if not new_holding_id or not row.get("valuation_date") or row.get("value") is None:
            _skip("valuations")
            continue
        db.session.add(HoldingValuation(
            holding_id=new_holding_id,
            user_id=user_id,
            valuation_date=_parse_date(row["valuation_date"]),
            value=safe_float(row["value"]),
            currency=row.get("currency", "USD"),
            notes=row.get("notes"),
        ))
        valuations_restored += 1

    liability_id_map: Dict[int, int] = {}
    liabilities_restored = 0
    for row in data.get("liabilities", []):
        if not row.get("name") or not row.get("liability_type") or row.get("current_balance") is None:
            _skip("liabilities")
            continue
        liability = Liability(
            user_id=user_id,
            household_id=None,
            name=row["name"],
            liability_type=row["liability_type"],
            currency=row.get("currency", "USD"),
            current_balance=safe_float(row["current_balance"]),
            original_amount=safe_float(row["original_amount"]) if row.get("original_amount") is not None else None,
            interest_rate=safe_float(row["interest_rate"]) if row.get("interest_rate") is not None else None,
            notes=row.get("notes"),
            is_private=bool(row.get("is_private", False)),
        )
        db.session.add(liability)
        db.session.flush()
        if row.get("id") is not None:
            liability_id_map[row["id"]] = liability.id
        liabilities_restored += 1

    alerts_restored = 0
    for row in data.get("alerts", []):
        if not row.get("alert_type") or row.get("threshold") is None:
            _skip("alerts")
            continue
        db.session.add(PriceAlert(
            user_id=user_id,
            holding_id=holding_id_map.get(row.get("holding_id")) if row.get("holding_id") else None,
            symbol=row.get("symbol"),
            asset_type=row.get("asset_type"),
            alert_type=row["alert_type"],
            threshold=safe_float(row["threshold"]),
            currency=row.get("currency", "USD"),
            status="active",  # never restore as already-"triggered" -- a restored alert should evaluate fresh
        ))
        alerts_restored += 1

    milestones_restored = 0
    for row in data.get("milestones", []):
        if row.get("threshold") is None or not row.get("achieved_date"):
            _skip("milestones")
            continue
        db.session.add(Milestone(
            user_id=user_id,
            household_id=None,
            threshold=safe_float(row["threshold"]),
            currency=row.get("currency", "USD"),
            achieved_date=_parse_date(row["achieved_date"]),
            acknowledged=bool(row.get("acknowledged", False)),
        ))
        milestones_restored += 1

    snapshots_restored = 0
    for row in data.get("net_worth_snapshots", []):
        if row.get("total_net_worth") is None or not row.get("snapshot_date"):
            _skip("net_worth_snapshots")
            continue
        db.session.add(NetWorthSnapshot(
            user_id=user_id,
            household_id=None,
            snapshot_date=_parse_date(row["snapshot_date"]),
            total_net_worth=safe_float(row["total_net_worth"]),
            total_stock_value=safe_float(row.get("total_stock_value", 0)),
            total_property_value=safe_float(row.get("total_property_value", 0)),
            total_profit_loss=safe_float(row.get("total_profit_loss", 0)),
            total_liabilities=safe_float(row.get("total_liabilities", 0)),
            by_asset_type=row.get("by_asset_type"),
            currency=row.get("currency", "USD"),
        ))
        snapshots_restored += 1

    accounts_restored = 0
    for row in data.get("accounts", []):
        if not row.get("name"):
            _skip("accounts")
            continue
        db.session.add(Account(user_id=user_id, household_id=None, name=row["name"]))
        accounts_restored += 1

    goals_restored = 0
    for row in data.get("goals", []):
        if not row.get("name") or row.get("target_amount") is None:
            _skip("goals")
            continue
        db.session.add(Goal(
            user_id=user_id,
            name=row["name"],
            target_amount=safe_float(row["target_amount"]),
            currency=row.get("currency", "USD"),
            target_date=_parse_date(row.get("target_date")),
        ))
        goals_restored += 1

    allocation_targets_restored = 0
    for row in data.get("allocation_targets", []):
        if not row.get("asset_type") or row.get("target_pct") is None:
            _skip("allocation_targets")
            continue
        db.session.add(AllocationTarget(user_id=user_id, asset_type=row["asset_type"], target_pct=safe_float(row["target_pct"])))
        allocation_targets_restored += 1

    budget_categories_restored = 0
    for row in data.get("budget_categories", []):
        if not row.get("entry_type") or not row.get("name"):
            _skip("budget_categories")
            continue
        db.session.add(BudgetCategory(user_id=user_id, household_id=None, entry_type=row["entry_type"], name=row["name"]))
        budget_categories_restored += 1

    budget_limits_restored = 0
    for row in data.get("budget_limits", []):
        if not row.get("category") or row.get("monthly_limit") is None:
            _skip("budget_limits")
            continue
        db.session.add(BudgetLimit(
            user_id=user_id,
            household_id=None,
            category=row["category"],
            monthly_limit=safe_float(row["monthly_limit"]),
            currency=row.get("currency", "USD"),
        ))
        budget_limits_restored += 1

    budget_entries_restored = 0
    for row in data.get("budget_entries", []):
        if not row.get("entry_type") or not row.get("entry_date") or row.get("amount") is None or not row.get("category"):
            _skip("budget_entries")
            continue
        db.session.add(BudgetEntry(
            user_id=user_id,
            household_id=None,
            entry_type=row["entry_type"],
            entry_date=_parse_date(row["entry_date"]),
            amount=safe_float(row["amount"]),
            currency=row.get("currency", "USD"),
            category=row["category"],
            description=row.get("description"),
            is_private=bool(row.get("is_private", False)),
            is_recurring=bool(row.get("is_recurring", False)),
            recurring_frequency=row.get("recurring_frequency"),
            linked_liability_id=liability_id_map.get(row.get("linked_liability_id")) if row.get("linked_liability_id") else None,
            deposit_target_holding_id=holding_id_map.get(row.get("deposit_target_holding_id"))
            if row.get("deposit_target_holding_id")
            else None,
        ))
        budget_entries_restored += 1

    db.session.commit()

    return {
        "holdings_restored": holdings_restored,
        "transactions_restored": transactions_restored,
        "valuations_restored": valuations_restored,
        "liabilities_restored": liabilities_restored,
        "alerts_restored": alerts_restored,
        "milestones_restored": milestones_restored,
        "net_worth_snapshots_restored": snapshots_restored,
        "accounts_restored": accounts_restored,
        "goals_restored": goals_restored,
        "allocation_targets_restored": allocation_targets_restored,
        "budget_categories_restored": budget_categories_restored,
        "budget_limits_restored": budget_limits_restored,
        "budget_entries_restored": budget_entries_restored,
        "skipped": skipped,
    }


class AccountDeletionUnavailable(RuntimeError):
    """The server is not set up to remove logins (no Supabase service key)."""


def delete_account(user_id) -> Dict:
    """Removes everything the user stored, then their login itself.

    Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. When either is missing
    nothing is deleted, so a half-configured server never strands someone with
    no data and a login they cannot remove. If the login removal fails after
    the data is gone, the error says so and the call can simply be repeated."""
    base = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        raise AccountDeletionUnavailable("Deleting the account is not set up on this server yet.")
    summary = delete_all_user_data(user_id)
    try:
        resp = requests.delete(
            f"{base.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=20,
        )
    except requests.RequestException as exc:
        raise RuntimeError("Your data was deleted, but removing the login failed. Try again.") from exc
    if resp.status_code not in (200, 204, 404):
        raise RuntimeError("Your data was deleted, but removing the login failed. Try again.")
    summary["login_deleted"] = True
    return summary
