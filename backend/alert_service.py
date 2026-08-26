"""
Price / net-worth alert evaluation. Called by /internal/check-alerts (a
GitHub Actions cron, mirroring the daily snapshot / weekly digest jobs).
"""
from datetime import datetime
from typing import Dict

from sqlalchemy import text

from . import price_service
from .email_service import render_alert_email, send
from .holdings_service import list_holdings_with_metrics
from .liability_service import total_liabilities_display
from .models import Holding, Liability, PriceAlert, db


def _user_email(user_id):
    row = db.session.execute(
        text("select email from auth.users where id = :user_id"), {"user_id": str(user_id)}
    ).first()
    return row[0] if row else None


def _current_net_worth(user_id, currency="USD") -> float:
    """True net worth (assets minus liabilities), matching the dashboard
    and daily snapshots — this function predates the liabilities feature
    and was assets-only until found live (same class of bug already fixed
    in digest_service.py): a net_worth_above/below alert would trigger
    against gross assets, firing well before (or never, for _below) the
    threshold the user actually meant relative to their real net worth."""
    holdings = Holding.query.filter_by(user_id=user_id).all()
    metrics = list_holdings_with_metrics(holdings, display_currency=currency)
    total_assets = sum(h["display_value"] for h in metrics)

    liabilities = Liability.query.filter_by(user_id=user_id).all()
    total_liabilities = total_liabilities_display(liabilities, display_currency=currency)
    return total_assets - total_liabilities


def check_all_alerts() -> Dict:
    """Evaluate every active alert; trigger + email any that cross their
    threshold. Safe to run repeatedly — triggered alerts flip to 'triggered'
    status so they won't re-fire."""
    alerts = PriceAlert.query.filter_by(status="active").all()
    triggered = 0

    for alert in alerts:
        if alert.alert_type in ("price_above", "price_below"):
            current_value = price_service.get_current_price(alert.asset_type, alert.symbol, alert.currency)
        else:
            current_value = _current_net_worth(alert.user_id, alert.currency)

        if current_value is None:
            continue

        should_trigger = (
            alert.alert_type in ("price_above", "net_worth_above") and current_value >= alert.threshold
        ) or (
            alert.alert_type in ("price_below", "net_worth_below") and current_value <= alert.threshold
        )

        if should_trigger:
            alert.status = "triggered"
            alert.triggered_at = datetime.utcnow()
            triggered += 1
            email = _user_email(alert.user_id)
            if email:
                send(email, "Price Alert Triggered", render_alert_email(alert.to_dict(), current_value))

    db.session.commit()
    return {"alerts_checked": len(alerts), "alerts_triggered": triggered}
