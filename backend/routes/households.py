"""Routes: households. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import abort, g, jsonify, request

from ..audit_service import record
from ..auth import require_auth
from ..household_service import (
    accept_invite,
    can_edit_household,
    create_household,
    create_invite,
    delete_household,
    get_member_household_ids,
    get_role,
    leave_household,
    list_members_with_email,
    list_my_households,
    list_my_pending_invites,
    remove_member,
)

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
    @app.route("/households", methods=["POST"])
    @require_auth
    def create_household_route():
        data = request.get_json(force=True)
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        household = create_household(g.user_id, name)
        return jsonify(household.to_dict()), 201

    @app.route("/households", methods=["GET"])
    @require_auth
    def list_households_route():
        households = list_my_households(g.user_id)
        return jsonify([
            {**h.to_dict(), "my_role": get_role(str(h.id), g.user_id)} for h in households
        ])

    @app.route("/households/<uuid:household_id>/members", methods=["GET"])
    @require_auth
    def list_household_members_route(household_id):
        household_id = str(household_id)
        if household_id not in get_member_household_ids(g.user_id):
            abort(403)
        return jsonify(list_members_with_email(household_id))

    @app.route("/households/<uuid:household_id>/invites", methods=["POST"])
    @require_auth
    def create_invite_route(household_id):
        household_id = str(household_id)
        if not can_edit_household(household_id, g.user_id):
            abort(403, description="Only the owner or an editor can invite members")
        data = request.get_json(force=True)
        email = (data.get("email") or "").strip()
        role = data.get("role", "editor")
        if not email:
            return jsonify({"error": "email is required"}), 400
        if role not in ("editor", "viewer"):
            return jsonify({"error": "role must be 'editor' or 'viewer'"}), 400
        invite = create_invite(household_id, g.user_id, email, role=role)
        record("household.invited", detail=f"{email} as {role}")
        return jsonify(invite.to_dict()), 201

    @app.route("/invites", methods=["GET"])
    @require_auth
    def list_my_invites_route():
        return jsonify([i.to_dict() for i in list_my_pending_invites(g.user_email)])

    @app.route("/invites/<uuid:invite_id>/accept", methods=["POST"])
    @require_auth
    def accept_invite_route(invite_id):
        try:
            invite = accept_invite(invite_id, g.user_id, g.user_email)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        record("household.joined")
        return jsonify(invite.to_dict())

    @app.route("/households/<uuid:household_id>/leave", methods=["POST"])
    @require_auth
    def leave_household_route(household_id):
        try:
            leave_household(str(household_id), g.user_id)
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        record("household.left")
        return jsonify({"message": "Left household"})

    @app.route("/households/<uuid:household_id>/members/<uuid:target_user_id>", methods=["DELETE"])
    @require_auth
    def remove_member_route(household_id, target_user_id):
        try:
            remove_member(str(household_id), g.user_id, str(target_user_id))
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        record("household.member_removed")
        return jsonify({"message": "Member removed"})

    @app.route("/households/<uuid:household_id>", methods=["DELETE"])
    @require_auth
    def delete_household_route(household_id):
        data = request.get_json(silent=True) or {}
        if data.get("confirm") != "DELETE":
            return jsonify({"error": "Send {\"confirm\": \"DELETE\"} to confirm — this removes all members and unshares everyone's data."}), 400
        try:
            delete_household(str(household_id), g.user_id)
        except ValueError as e:
            return jsonify({"error": str(e)}), 404
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        record("household.deleted")
        return jsonify({"message": "Household deleted"})
