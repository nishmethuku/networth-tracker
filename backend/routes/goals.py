"""Routes: goals. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os
from datetime import date

from flask import abort, g, jsonify, request

from ..auth import require_auth
from ..goal_service import create_goal, delete_goal, list_goals, update_goal
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
    @app.route("/goals", methods=["GET"])
    @require_auth
    def list_goals_route():
        return jsonify(list_goals(g.user_id))

    @app.route("/goals", methods=["POST"])
    @require_auth
    def create_goal_route():
        data = request.get_json(force=True)
        try:
            goal = create_goal(
                g.user_id,
                name=data.get("name"),
                target_amount=safe_float(data.get("target_amount")),
                currency=data.get("currency", "USD"),
                target_date=date.fromisoformat(data["target_date"]) if data.get("target_date") else None,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(goal), 201

    @app.route("/goals/<int:goal_id>", methods=["PUT"])
    @require_auth
    def update_goal_route(goal_id):
        data = request.get_json(force=True)
        fields = {}
        if "name" in data:
            fields["name"] = data["name"]
        if "target_amount" in data:
            fields["target_amount"] = safe_float(data["target_amount"])
        if "currency" in data:
            fields["currency"] = data["currency"]
        if "target_date" in data:
            fields["target_date"] = date.fromisoformat(data["target_date"]) if data["target_date"] else None
        try:
            goal = update_goal(goal_id, g.user_id, **fields)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except PermissionError:
            abort(403)
        return jsonify(goal)

    @app.route("/goals/<int:goal_id>", methods=["DELETE"])
    @require_auth
    def delete_goal_route(goal_id):
        try:
            delete_goal(goal_id, g.user_id)
        except PermissionError:
            abort(403)
        return jsonify({"message": "Goal deleted"}), 200
