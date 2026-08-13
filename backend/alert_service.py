"""
Price / net-worth alert evaluation. Called by /internal/check-alerts (a
GitHub Actions cron, mirroring the daily snapshot / weekly digest jobs).
"""
from datetime import datetime
from typing import Dict

from sqlalchemy import text

from .models import db, PriceAlert, Holding
from . import price_service
from .holdings_service import list_holdings_with_metrics
from .email_service import send, render_alert_email


def _user_email(user_id):
    row = db.session.execute(
        text("select email from auth.users where id = :user_id"), {"user_id": str(user_id)}
    ).first()
    return row[0] if row else None


def _current_net_worth(user_id, currency="USD") -> float:
    holdings = Holding.query.filter_by(user_id=user_id).all()
    metrics = list_holdings_with_metrics(holdings, display_currency=currency)
    return sum(h["display_value"] for h in metrics)


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
