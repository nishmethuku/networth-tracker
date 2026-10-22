"""
Monthly net worth report. Sent on the 1st (GitHub Actions cron hitting
/internal/monthly-report) and summarizes the calendar month that just ended:
net worth change, dividends and interest received, the biggest positions, and
a concentration note. Users only (not households) for now, and it reuses the
weekly digest's recipient lookup and unsubscribe list.
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

from .digest_service import _recipients
from .email_service import render_monthly_email, send
from .holdings_service import list_holdings_with_metrics
from .income_service import get_income_summary
from .liability_service import total_liabilities_display
from .models import Holding, Liability, NetWorthSnapshot, db
from .unsubscribe_service import generate_unsubscribe_token, is_unsubscribed

logger = logging.getLogger(__name__)

CONCENTRATION_THRESHOLD_PCT = 25.0


def report_month(today: date) -> Dict:
    """The calendar month before `today`: its label, first day and last day."""
    last_day = today.replace(day=1) - timedelta(days=1)
    first_day = last_day.replace(day=1)
    return {"label": first_day.strftime("%B %Y"), "key": first_day.strftime("%Y-%m"), "first_day": first_day, "last_day": last_day}


def summarize_month(
    net_worth_end: float,
    net_worth_start: Optional[float],
    income: float,
    holdings: List[Dict],
) -> Dict:
    """Pure summary. holdings: dicts with name, symbol, display_value and
    display_unrealized_gain (any may be missing). The change is None when
    there is no starting snapshot to compare against, and the percentage is
    None when the starting net worth is not positive."""
    change = round(net_worth_end - net_worth_start, 2) if net_worth_start is not None else None
    change_pct = round(change / net_worth_start * 100, 2) if change is not None and net_worth_start and net_worth_start > 0 else None

    assets = [h for h in holdings if (h.get("display_value") or 0) > 0]
    total_assets = sum(h["display_value"] for h in assets)
    ranked = sorted(assets, key=lambda h: h["display_value"], reverse=True)
    top = ranked[0] if ranked else None
    top_pct = round(top["display_value"] / total_assets * 100, 1) if top and total_assets > 0 else None

    return {
        "net_worth": round(net_worth_end, 2),
        "change": change,
        "change_pct": change_pct,
        "income": round(income, 2),
        "top_holdings": [
            {"name": h.get("symbol") or h.get("name") or "Holding", "value": round(h["display_value"], 2), "pct": round(h["display_value"] / total_assets * 100, 1)}
            for h in ranked[:3]
        ],
        "concentration": (
            {"name": top.get("symbol") or top.get("name") or "Holding", "pct": top_pct}
            if top_pct is not None and top_pct > CONCENTRATION_THRESHOLD_PCT
            else None
        ),
    }


def _snapshot_on_or_before(user_id, day: date):
    return (
        NetWorthSnapshot.query.filter_by(user_id=user_id)
        .filter(NetWorthSnapshot.snapshot_date <= day)
        .order_by(NetWorthSnapshot.snapshot_date.desc())
        .first()
    )


def _build_for_user(user_id, today: date) -> Dict:
    month = report_month(today)
    holdings = Holding.query.filter_by(user_id=user_id).filter(Holding.deleted_at.is_(None)).all()
    metrics = list_holdings_with_metrics(holdings, display_currency="USD")
    total_assets = sum(h["display_value"] for h in metrics)
    total_liabilities = total_liabilities_display(Liability.query.filter_by(user_id=user_id).all(), display_currency="USD")
    live_net_worth = total_assets - total_liabilities

    end_snap = _snapshot_on_or_before(user_id, month["last_day"])
    start_snap = _snapshot_on_or_before(user_id, month["first_day"] - timedelta(days=1))
    net_worth_end = end_snap.total_net_worth if end_snap else live_net_worth

    income_rows = get_income_summary(user_id=user_id, display_currency="USD")["by_month"]
    income = next((r["amount"] for r in income_rows if r["month"] == month["key"]), 0.0)

    summary = summarize_month(net_worth_end, start_snap.total_net_worth if start_snap else None, income, metrics)
    summary["month_label"] = month["label"]
    summary["user_id"] = str(user_id)
    return summary


def build_monthly_report(send_emails: bool = True, today: Optional[date] = None) -> List[Dict]:
    today = today or date.today()
    reports = []
    user_ids = {row[0] for row in db.session.query(Holding.user_id).distinct()}
    for user_id in user_ids:
        # One user's bad data must not stop everyone else's report.
        try:
            report = _build_for_user(user_id, today)
            reports.append(report)
            if send_emails:
                for r in _recipients(user_id=user_id):
                    if is_unsubscribed(r["email"]):
                        continue
                    token = generate_unsubscribe_token(r["email"])
                    send(r["email"], f"Your {report['month_label']} Net Worth Report", render_monthly_email(report, r["name"], token))
        except Exception:
            db.session.rollback()
            logger.exception("Monthly report failed for user %s", user_id)
    return reports
