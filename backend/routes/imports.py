"""Routes: imports. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

from flask import g, jsonify, request

from ..auth import require_auth
from ..bank_import_service import confirm_bank_import, parse_statement
from ..simple_csv_import_service import parse_simple_csv
from ..smart_import_service import confirm_smart_import, parse_spreadsheet

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
    require_ai_access = h.require_ai_access
    validate_household_id_for_write = h.validate_household_id_for_write

    @app.route("/import/simple-csv-parse", methods=["POST"])
    @require_auth
    def import_simple_csv_parse():
        """Deterministic (no AI) parse of the one agreed CSV format --
        confirm goes through /import/smart-confirm, since the row shape
        this produces matches exactly what that route already expects."""
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "file is required"}), 400
        if not file.filename.lower().endswith(".csv"):
            return jsonify({"error": "Only .csv files are supported"}), 400
        raw = file.read()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                # Windows' plain "CSV (Comma delimited)" export (as opposed
                # to "CSV UTF-8") uses the system codepage, not UTF-8 --
                # cp1252 covers the common case without failing outright.
                text = raw.decode("cp1252")
            except UnicodeDecodeError:
                return jsonify({
                    "error": "Couldn't read this file as text. Try re-saving it as \"CSV UTF-8\" from Excel/Sheets and uploading again."
                }), 400
        result = parse_simple_csv(text)
        return jsonify(result)

    @app.route("/import/smart-parse", methods=["POST"])
    @require_auth
    @limiter.limit("10 per hour")
    def import_smart_parse():
        """AI-assisted import of a freeform personal spreadsheet (owner/editor
        only, same as the other AI features — reuses require_ai_access)."""
        household_id = request.form.get("household_id") or None
        require_ai_access(household_id)

        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "file is required"}), 400
        if not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
            return jsonify({"error": "Only .xlsx, .xls, or .csv files are supported"}), 400

        result = parse_spreadsheet(file.read(), file.filename)
        return jsonify(result)

    @app.route("/import/smart-confirm", methods=["POST"])
    @require_auth
    def import_smart_confirm():
        data = request.get_json(force=True)
        rows = data.get("rows", [])
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        if not rows:
            return jsonify({"error": "No rows to import"}), 400
        result = confirm_smart_import(rows, g.user_id, household_id=household_id)
        return jsonify(result), 201

    @app.route("/import/bank-statement-parse", methods=["POST"])
    @require_auth
    @limiter.limit("10 per hour")
    def import_bank_statement_parse():
        """AI-assisted import of a bank/credit card statement into Budget
        entries — CSV, Excel, or PDF. Owner/editor only, same as other AI
        features (reuses require_ai_access)."""
        household_id = request.form.get("household_id") or None
        require_ai_access(household_id)

        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "file is required"}), 400
        if not file.filename.lower().endswith((".xlsx", ".xls", ".csv", ".pdf")):
            return jsonify({"error": "Only .xlsx, .xls, .csv, or .pdf files are supported"}), 400

        result = parse_statement(file.read(), file.filename)
        return jsonify(result)

    @app.route("/import/bank-statement-confirm", methods=["POST"])
    @require_auth
    def import_bank_statement_confirm():
        data = request.get_json(force=True)
        rows = data.get("rows", [])
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        if not rows:
            return jsonify({"error": "No rows to import"}), 400
        currency = data.get("currency", "USD").upper()
        result = confirm_bank_import(rows, g.user_id, household_id=household_id, currency=currency)
        return jsonify(result), 201
