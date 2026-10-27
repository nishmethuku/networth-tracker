"""Routes: linked banks and brokers (automatic syncing). Off until SYNC_PROVIDER is set."""
from flask import g, jsonify, request

from .. import sync_service
from ..auth import require_auth
from ..models import LinkedConnection


def register(app, h):
    limiter = app.extensions["limiter"]

    def _setup():
        """(provider, vault) or None when syncing is not set up."""
        provider = sync_service.get_provider()
        if provider is None:
            return None
        return provider, sync_service.TokenVault()

    def _own(conn_id):
        conn = LinkedConnection.query.filter_by(id=conn_id, user_id=g.user_id).first()
        if not conn:
            return None
        return conn

    @app.route("/sync/status", methods=["GET"])
    @require_auth
    def sync_status():
        try:
            provider = sync_service.get_provider()
        except sync_service.SyncError as exc:
            return jsonify({"enabled": False, "provider": None, "reason": str(exc), "connections": []})
        conns = LinkedConnection.query.filter_by(user_id=g.user_id).filter(LinkedConnection.status != "disconnected").all()
        return jsonify({"enabled": provider is not None, "provider": provider.name if provider else None, "connections": [c.to_dict() for c in conns]})

    @app.route("/sync/link-token", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def sync_link_token():
        try:
            setup = _setup()
            if setup is None:
                return jsonify({"error": "Bank syncing is not turned on."}), 404
            provider, _vault = setup
            return jsonify({"link_token": provider.create_link_token(str(g.user_id))})
        except sync_service.SyncError as exc:
            return jsonify({"error": str(exc)}), 503

    @app.route("/sync/exchange", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def sync_exchange():
        data = request.get_json(force=True) or {}
        public_token = data.get("public_token")
        if not public_token:
            return jsonify({"error": "public_token is required"}), 400
        household_id = data.get("household_id")
        h.validate_household_id_for_write(household_id)
        try:
            setup = _setup()
            if setup is None:
                return jsonify({"error": "Bank syncing is not turned on."}), 404
            provider, vault = setup
            conn = sync_service.connect(provider, vault, g.user_id, household_id, public_token, data.get("institution_name"))
            return jsonify(conn.to_dict()), 201
        except sync_service.SyncError as exc:
            return jsonify({"error": str(exc)}), 503

    @app.route("/sync/connections/<int:conn_id>/pull", methods=["POST"])
    @require_auth
    @limiter.limit("6 per minute")
    def sync_pull(conn_id):
        conn = _own(conn_id)
        if not conn:
            return jsonify({"error": "Connection not found"}), 404
        try:
            setup = _setup()
            if setup is None:
                return jsonify({"error": "Bank syncing is not turned on."}), 404
            provider, vault = setup
            return jsonify(sync_service.pull(provider, vault, conn))
        except sync_service.SyncError as exc:
            return jsonify({"error": str(exc)}), 502

    @app.route("/sync/connections/<int:conn_id>", methods=["DELETE"])
    @require_auth
    def sync_disconnect(conn_id):
        conn = _own(conn_id)
        if not conn:
            return jsonify({"error": "Connection not found"}), 404
        sync_service.disconnect(conn)
        return jsonify(conn.to_dict())
