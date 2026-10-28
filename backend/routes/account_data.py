"""Routes: account data. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os
from datetime import date

from flask import Response, g, jsonify, request

from ..account_service import (
    AccountDeletionUnavailable,
    delete_account,
    delete_all_user_data,
    export_user_data,
    export_user_data_csv_zip,
    restore_user_data,
)
from ..auth import require_auth
from ..unsubscribe_service import is_unsubscribed
from ..unsubscribe_service import resubscribe as resubscribe_email
from ..unsubscribe_service import unsubscribe as unsubscribe_email

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
    limiter = app.extensions["limiter"]

    @app.route("/account/export", methods=["GET"])
    @require_auth
    def account_export():
        return jsonify(export_user_data(g.user_id))

    @app.route("/account/export.zip", methods=["GET"])
    @require_auth
    def account_export_csv():
        """Same data as /account/export, as a zip of one CSV per table — for
        a backup that opens directly in Excel/Sheets."""
        zip_bytes = export_user_data_csv_zip(g.user_id)
        filename = f"networth-tracker-backup-{date.today().isoformat()}.zip"
        return Response(
            zip_bytes,
            mimetype="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.route("/account/restore", methods=["POST"])
    @require_auth
    @limiter.limit("5 per hour")
    def account_restore():
        """Restores from a /account/export-shaped JSON backup -- not the
        .zip (that's CSVs for opening in a spreadsheet, not a structured
        format this reads back). Additive: existing data is untouched,
        everything in the file is inserted as new personal data (never a
        household's), so restoring the same file twice duplicates it --
        same as re-running a CSV import twice would."""
        data = request.get_json(force=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Expected a JSON object (the file from Settings → Download as JSON)"}), 400
        result = restore_user_data(g.user_id, data)
        return jsonify(result), 200

    @app.route("/account/data", methods=["DELETE"])
    @require_auth
    @limiter.limit("5 per hour")
    def account_delete_data():
        data = request.get_json(silent=True) or {}
        if data.get("confirm") != "DELETE":
            return jsonify({"error": "Type DELETE to confirm this action"}), 400
        result = delete_all_user_data(g.user_id)
        return jsonify(result)

    @app.route("/account", methods=["DELETE"])
    @require_auth
    @limiter.limit("3 per hour")
    def account_delete():
        data = request.get_json(silent=True) or {}
        if data.get("confirm") != "DELETE ACCOUNT":
            return jsonify({"error": "Type DELETE ACCOUNT to confirm this action"}), 400
        try:
            return jsonify(delete_account(g.user_id))
        except AccountDeletionUnavailable as exc:
            return jsonify({"error": str(exc)}), 503
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 502

    @app.route("/account/digest-subscription", methods=["GET"])
    @require_auth
    def get_digest_subscription():
        """Backs the Settings-page toggle — reads the same email_unsubscribes
        row the one-click link in the digest email itself writes to."""
        if not g.user_email:
            return jsonify({"subscribed": False}), 200
        return jsonify({"subscribed": not is_unsubscribed(g.user_email)}), 200

    @app.route("/account/digest-subscription", methods=["PUT"])
    @require_auth
    def set_digest_subscription():
        if not g.user_email:
            return jsonify({"error": "This account has no email on file"}), 400
        data = request.get_json(force=True)
        subscribed = bool(data.get("subscribed"))
        (resubscribe_email if subscribed else unsubscribe_email)(g.user_email)
        return jsonify({"subscribed": subscribed}), 200
