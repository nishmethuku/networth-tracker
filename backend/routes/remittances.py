"""Routes: remittances (a log of money sent to family abroad) and their summary."""
from flask import g, jsonify, request

from ..auth import require_auth
from ..remittance_service import (
    create_remittance,
    delete_remittance,
    list_remittances,
    summarize,
    update_remittance,
)


def register(app, h):
    @app.route("/remittances", methods=["GET"])
    @require_auth
    def list_remittances_route():
        items = list_remittances(g.user_id)
        return jsonify({"items": items, "summary": summarize(items)})

    @app.route("/remittances", methods=["POST"])
    @require_auth
    def create_remittance_route():
        data = request.get_json(force=True)
        try:
            return jsonify(create_remittance(g.user_id, data)), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.route("/remittances/<int:remittance_id>", methods=["PUT"])
    @require_auth
    def update_remittance_route(remittance_id):
        data = request.get_json(force=True)
        try:
            row = update_remittance(remittance_id, g.user_id, data)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        if row is None:
            return jsonify({"error": "Remittance not found"}), 404
        return jsonify(row)

    @app.route("/remittances/<int:remittance_id>", methods=["DELETE"])
    @require_auth
    def delete_remittance_route(remittance_id):
        if not delete_remittance(remittance_id, g.user_id):
            return jsonify({"error": "Remittance not found"}), 404
        return jsonify({"message": "Remittance deleted"}), 200
