"""Routes: alerts push. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import abort, g, jsonify, request

from .. import push_service
from ..auth import require_auth
from ..models import (
    PriceAlert,
    PushSubscription,
    db,
)
from ..services import safe_float

try:
    from ..utils import MFTOOL_AVAILABLE, get_mf_instance
except (ImportError, AttributeError):
    MFTOOL_AVAILABLE = False

    def get_mf_instance():
        return None

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")
DIGEST_SECRET = os.environ.get("DIGEST_SECRET") or SNAPSHOT_SECRET

logger = logging.getLogger("networth_tracker")


def register(app, h):
    get_authorized_holding = h.get_authorized_holding
    limiter = app.extensions["limiter"]

    @app.route("/alerts", methods=["GET"])
    @require_auth
    def list_alerts():
        alerts = PriceAlert.query.filter_by(user_id=g.user_id).order_by(PriceAlert.created_at.desc()).all()
        return jsonify([a.to_dict() for a in alerts])

    @app.route("/alerts", methods=["POST"])
    @require_auth
    def create_alert():
        data = request.get_json(force=True)
        alert_type = data.get("alert_type")
        if alert_type not in ("price_above", "price_below", "net_worth_above", "net_worth_below"):
            return jsonify({"error": "Invalid alert_type"}), 400

        # Authorize the linked holding (if any) before constructing/adding
        # the alert, same autoflush-safe ordering as linked_liability_id in
        # create_budget_entry above — a bad/foreign id 404s cleanly here
        # instead of letting check_all_alerts later use another user's
        # holding id unchecked.
        holding_id = data.get("holding_id")
        if holding_id:
            get_authorized_holding(holding_id)

        alert = PriceAlert(
            user_id=g.user_id,
            holding_id=holding_id,
            symbol=data.get("symbol"),
            asset_type=data.get("asset_type"),
            alert_type=alert_type,
            threshold=safe_float(data.get("threshold")),
            currency=data.get("currency", "USD"),
        )
        db.session.add(alert)
        db.session.commit()
        return jsonify(alert.to_dict()), 201

    @app.route("/alerts/<int:alert_id>", methods=["DELETE"])
    @require_auth
    def delete_alert(alert_id):
        alert = PriceAlert.query.get_or_404(alert_id)
        if str(alert.user_id) != str(g.user_id):
            abort(403)
        db.session.delete(alert)
        db.session.commit()
        return jsonify({"message": "Alert deleted"}), 200

    # ---------------- WEB PUSH (browser notifications for triggered alerts) ----------------

    @app.route("/push/vapid-public-key", methods=["GET"])
    @require_auth
    def push_vapid_public_key():
        if not push_service.is_configured():
            return jsonify({"configured": False, "public_key": None})
        return jsonify({"configured": True, "public_key": push_service.VAPID_PUBLIC_KEY})

    @app.route("/push/subscribe", methods=["POST"])
    @require_auth
    def push_subscribe():
        data = request.get_json(force=True)
        endpoint = data.get("endpoint")
        keys = data.get("keys") or {}
        if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
            return jsonify({"error": "endpoint and keys.p256dh/keys.auth are required"}), 400

        # Upsert by endpoint -- the same browser/device re-subscribing (e.g.
        # after the page reloads) must update the existing row rather than
        # violate the unique constraint or create a duplicate that'd send
        # the same alert twice.
        existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
        if existing:
            existing.user_id = g.user_id
            existing.p256dh = keys["p256dh"]
            existing.auth = keys["auth"]
        else:
            db.session.add(PushSubscription(user_id=g.user_id, endpoint=endpoint, p256dh=keys["p256dh"], auth=keys["auth"]))
        db.session.commit()
        return jsonify({"message": "Subscribed"}), 201

    @app.route("/push/subscribe", methods=["DELETE"])
    @require_auth
    def push_unsubscribe():
        data = request.get_json(force=True)
        endpoint = data.get("endpoint")
        if not endpoint:
            return jsonify({"error": "endpoint is required"}), 400
        PushSubscription.query.filter_by(endpoint=endpoint, user_id=g.user_id).delete()
        db.session.commit()
        return jsonify({"message": "Unsubscribed"}), 200

    @app.route("/push/test", methods=["POST"])
    @require_auth
    @limiter.limit("5 per minute")
    def push_test():
        """Lets a user confirm push actually reaches *this* device right
        after enabling it, rather than finding out only whenever their
        next real alert happens to trigger. Scoped to the one subscription
        the frontend is currently looking at (not every device this user
        has ever enabled push on), so clicking "test" on a laptop doesn't
        also buzz a phone the user isn't holding."""
        data = request.get_json(force=True)
        endpoint = data.get("endpoint")
        if not endpoint:
            return jsonify({"error": "endpoint is required"}), 400
        sent = push_service.send_to_endpoint(g.user_id, endpoint, "Test notification", "Push notifications are working on this device.")
        if not sent:
            return jsonify({"error": "Couldn't send — try enabling push again."}), 400
        return jsonify({"message": "Sent"}), 200
