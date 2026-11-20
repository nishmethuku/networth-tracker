"""Routes: jobs. Moved out of app.py unchanged; shared helpers come in through `h`."""
import hmac
import html
import logging
import os
import threading

from flask import jsonify, request

from ..alert_service import check_all_alerts
from ..digest_service import build_weekly_digest
from ..liability_service import catch_up_all
from ..monthly_report_service import build_monthly_report
from ..snapshot_service import snapshot_all_users
from ..unsubscribe_service import unsubscribe as unsubscribe_email
from ..unsubscribe_service import verify_unsubscribe_token

try:
    from ..utils import MFTOOL_AVAILABLE, get_mf_instance
except (ImportError, AttributeError):
    MFTOOL_AVAILABLE = False

    def get_mf_instance():
        return None

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")
DIGEST_SECRET = os.environ.get("DIGEST_SECRET") or SNAPSHOT_SECRET

logger = logging.getLogger("networth_tracker")

_running_jobs = set()
_running_lock = threading.Lock()


def _run_in_background(app, name, fn):
    """Run a slow email job off the request thread.

    The weekly digest takes minutes on Render's free tier. Running it inside the
    request tied up a worker thread (and most of the 0.1 CPU) while people were
    using the app, and the cron call timed out. Returns False if the same job is
    already running, so a repeated trigger cannot double-send emails."""
    with _running_lock:
        if name in _running_jobs:
            return False
        _running_jobs.add(name)

    def _target():
        try:
            with app.app_context():
                fn()
        except Exception:
            logger.exception("Background job %s failed", name)
        finally:
            with _running_lock:
                _running_jobs.discard(name)

    threading.Thread(target=_target, name=name, daemon=True).start()
    return True


def register(app, h):
    limiter = app.extensions["limiter"]

    @app.route("/internal/snapshot", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_snapshot():
        """Called once a day by a GitHub Actions cron workflow, authenticated
        with a shared secret (not a user session)."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or not provided or not hmac.compare_digest(provided, SNAPSHOT_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        result = snapshot_all_users()
        return jsonify(result), 200

    @app.route("/internal/weekly-digest", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_weekly_digest():
        """Called weekly by a GitHub Actions cron workflow. Computes a real
        digest per user/household and emails each recipient via Resend
        (email_service.send) — falls back to logging if RESEND_API_KEY isn't
        set, so this is safe to run either way."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not DIGEST_SECRET or not provided or not hmac.compare_digest(provided, DIGEST_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        started = _run_in_background(app, "weekly-digest", build_weekly_digest)
        return jsonify({"started": started, "already_running": not started}), 202

    @app.route("/internal/monthly-report", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_monthly_report():
        """Builds and emails last month's report to each user. Same secret
        as the weekly digest, and intended for a monthly GitHub Actions cron."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not DIGEST_SECRET or not provided or not hmac.compare_digest(provided, DIGEST_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        started = _run_in_background(app, "monthly-report", build_monthly_report)
        return jsonify({"started": started, "already_running": not started}), 202

    @app.route("/internal/unsubscribe", methods=["GET"])
    @limiter.limit("30 per minute")
    def unsubscribe_from_digest():
        """One-click unsubscribe link from a digest email — no login required,
        verified via an HMAC-signed token rather than a session."""
        token = request.args.get("token", "")
        email = verify_unsubscribe_token(token)
        if not email:
            return "<p>This unsubscribe link is invalid or has expired.</p>", 400
        unsubscribe_email(email)
        # Escaped even though a valid HMAC means this can only be an email
        # that was genuinely issued a token (see verify_unsubscribe_token) —
        # defense in depth against interpolating any externally-influenced
        # string straight into an HTML response.
        return f"<p>{html.escape(email)} has been unsubscribed from the weekly net worth digest.</p>", 200

    @app.route("/internal/update-liabilities", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_update_liabilities():
        """Called daily by a GitHub Actions cron workflow: applies any monthly
        loan update (interest and EMI) that has come due. Safe to run twice."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or not provided or not hmac.compare_digest(provided, SNAPSHOT_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        return jsonify(catch_up_all()), 200

    @app.route("/internal/check-alerts", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_check_alerts():
        """Called every few hours by a GitHub Actions cron workflow."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or not provided or not hmac.compare_digest(provided, SNAPSHOT_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        result = check_all_alerts()
        return jsonify(result), 200
