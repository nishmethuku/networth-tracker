"""Routes: accounts. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import abort, g, jsonify, request

from ..account_registry_service import create_account, delete_account, delete_account_and_holdings, list_accounts, rename_account
from ..auth import require_auth
from ..household_service import (
    get_member_household_ids,
)
from ..models import (
    Account,
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
    validate_household_id_for_write = h.validate_household_id_for_write

    @app.route("/accounts", methods=["GET"])
    @require_auth
    def accounts_list():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        return jsonify(list_accounts(g.user_id if not household_id_param else None, household_id_param))

    @app.route("/accounts", methods=["POST"])
    @require_auth
    def accounts_create():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        try:
            account = create_account(g.user_id, name=data.get("name"), household_id=household_id)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(account), 201

    @app.route("/accounts/<int:account_id>", methods=["DELETE"])
    @require_auth
    def accounts_delete(account_id):
        account = Account.query.get_or_404(account_id)
        if account.household_id:
            validate_household_id_for_write(str(account.household_id))
        elif str(account.user_id) != str(g.user_id):
            abort(403)
        try:
            deleted = delete_account(account_id, g.user_id, str(account.household_id) if account.household_id else None)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        if not deleted:
            abort(404)
        return jsonify({"message": "Account deleted"}), 200

    @app.route("/accounts/delete-with-holdings", methods=["POST"])
    @require_auth
    def accounts_delete_with_holdings():
        """Deletes an account name and every holding filed under it in one
        step -- unlike DELETE /accounts/<id>, this works whether or not the
        account was ever formally registered (Account.id is None for
        CSV-imported/typed-in names), since it targets by name. A POST
        (not DELETE) because it needs a body and this isn't idempotent in
        the DELETE sense -- it's a bulk mutation, not a resource removal."""
        data = request.get_json(force=True)
        name = (data.get("name") or "").strip()
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        if not name:
            return jsonify({"error": "name is required"}), 400
        try:
            deleted_count = delete_account_and_holdings(g.user_id, name, household_id)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"message": f"Deleted '{name}' and {deleted_count} holding(s)", "holdings_deleted": deleted_count}), 200

    @app.route("/accounts/rename", methods=["POST"])
    @require_auth
    def accounts_rename():
        """Renames an account name across every holding filed under it --
        by name, like delete-with-holdings above, for the same reason
        (most account names were never formally registered)."""
        data = request.get_json(force=True)
        old_name = (data.get("old_name") or "").strip()
        new_name = (data.get("new_name") or "").strip()
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        if not old_name:
            return jsonify({"error": "old_name is required"}), 400
        if not new_name:
            return jsonify({"error": "new_name is required"}), 400
        try:
            updated_count = rename_account(g.user_id, old_name, new_name, household_id)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"message": f"Renamed to '{new_name}'", "holdings_updated": updated_count}), 200
