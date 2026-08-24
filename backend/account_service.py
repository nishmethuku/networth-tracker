"""
Self-service data export and data deletion for the Settings page's Danger
Zone. Scoped to data the caller owns (Holding.user_id) — shared household
holdings owned by someone else are untouched even if visible to this user.

Deletion here removes financial data only (holdings, transactions,
valuations, alerts, milestones) via the existing Postgres cascade FKs — it
does not delete the Supabase auth account itself, which needs the
service-role Admin API and is out of scope for now.
"""
import csv
import io
import zipfile
from typing import Dict

from .models import db, Holding, HoldingTransaction, HoldingValuation, PriceAlert, Milestone, BudgetEntry, BudgetLimit, Liability


def export_user_data(user_id) -> Dict:
    holdings = Holding.query.filter_by(user_id=user_id).all()
    holding_ids = [h.id for h in holdings]

    transactions = (
        HoldingTransaction.query.filter(HoldingTransaction.holding_id.in_(holding_ids)).all()
        if holding_ids
        else []
    )
    valuations = (
        HoldingValuation.query.filter(HoldingValuation.holding_id.in_(holding_ids)).all()
        if holding_ids
        else []
    )
    alerts = PriceAlert.query.filter_by(user_id=user_id).all()
    budget_entries = BudgetEntry.query.filter_by(user_id=user_id).all()
    budget_limits = BudgetLimit.query.filter_by(user_id=user_id).all()
    liabilities = Liability.query.filter_by(user_id=user_id).all()

    return {
        "holdings": [h.to_dict() for h in holdings],
        "transactions": [t.to_dict() for t in transactions],
        "valuations": [v.to_dict() for v in valuations],
        "alerts": [a.to_dict() for a in alerts],
        "budget_entries": [e.to_dict() for e in budget_entries],
        "budget_limits": [limit.to_dict() for limit in budget_limits],
        "liabilities": [l.to_dict() for l in liabilities],
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
    supabase/migrations/0002_holdings.sql), plus their alerts and personal
    milestones. Returns a count summary for the confirmation UI."""
    holdings = Holding.query.filter_by(user_id=user_id).all()
    holdings_count = len(holdings)

    for holding in holdings:
        db.session.delete(holding)

    alerts_count = PriceAlert.query.filter_by(user_id=user_id).delete()
    milestones_count = Milestone.query.filter_by(user_id=user_id).delete()
    liabilities_count = Liability.query.filter_by(user_id=user_id).delete()

    db.session.commit()

    return {
        "holdings_deleted": holdings_count,
        "alerts_deleted": alerts_count,
        "milestones_deleted": milestones_count,
        "liabilities_deleted": liabilities_count,
    }
