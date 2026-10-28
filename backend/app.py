import logging
import os
import uuid
from datetime import date, datetime
from types import SimpleNamespace

import sentry_sdk
from flask import Flask, abort, g, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from sentry_sdk.integrations.flask import FlaskIntegration
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

# Configured before any local module import below, since several of them
# (utils.py in particular) log at import time — e.g. whether mftool
# initialized successfully. Without this, those early messages would fall
# back to logging's unconfigured "handler of last resort" (stderr,
# WARNING+ only, no timestamp/module name), so INFO-level import-time
# diagnostics would be silently dropped.
#
# JSON-formatted (via .logging_config.JSONFormatter) so Render's log search
# can filter/group by request_id, user_id, level, or module instead of
# grepping plain text — every field a log line carries is greppable on its
# own rather than buried in a formatted string.
from .logging_config import JSONFormatter  # noqa: E402

_log_handler = logging.StreamHandler()
_log_handler.setFormatter(JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_log_handler])

from . import price_service
from .auth import require_auth
from .benchmark_service import get_benchmark_comparison
from .holdings_service import (
    TRANSACTION_TYPES,
    build_dashboard,
    build_funding_valuation,
    list_holdings_with_metrics,
    to_summary,
)
from .household_service import (
    can_edit_household,
    get_member_household_ids,
    get_role,
)
from .income_service import get_income_summary
from .liability_service import (
    total_liabilities_display,
)
from .models import (
    Holding,
    HoldingTransaction,
    HoldingValuation,
    Liability,
    PriceHistory,
    db,
)
from .routes import register_all
from .services import safe_float
from .sip_service import next_occurrences as next_sip_occurrences
from .sip_service import project_future_value as project_sip_future_value
from .tax_service import COST_BASIS_METHODS, TAX_DISCLAIMER, get_tax_summary

# Import lazy mftool getter — mf itself is always None now (see utils.py)
try:
    from .utils import MFTOOL_AVAILABLE, get_mf_instance
except (ImportError, AttributeError):
    MFTOOL_AVAILABLE = False

    def get_mf_instance():
        return None

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")
DIGEST_SECRET = os.environ.get("DIGEST_SECRET") or SNAPSHOT_SECRET

logger = logging.getLogger("networth_tracker")

# Machine-readable codes for the standardized error shape. HTTPException
# subclasses not listed here fall back to their class name, slugified.
_ERROR_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "unprocessable",
    429: "rate_limited",
    500: "internal_error",
}


def create_app():
    # Same "gracefully absent" pattern as every other optional integration
    # in this app (RESEND_API_KEY, GEMINI_API_KEY, ...): without SENTRY_DSN
    # set, this is a no-op — no error tracking, but nothing breaks either.
    # Called before Flask(__name__) so import-time errors in anything
    # imported below are captured too, not just request-time exceptions.
    sentry_dsn = os.environ.get("SENTRY_DSN")
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FlaskIntegration()],
            environment=os.environ.get("FLASK_ENV", "development"),
            # Error tracking only, not performance tracing — this is a
            # single free-tier Render instance for a personal app, and
            # trace sampling burns through Sentry's free-tier quota fast
            # for very little benefit at this scale.
            traces_sample_rate=0.0,
            send_default_pii=False,
        )

    app = Flask(__name__)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. This app requires a Postgres connection "
            "string (Supabase Project Settings → Database → Connection string)."
        )
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8MB — plenty for a personal spreadsheet

    # Behind Render's proxy, request.remote_addr is the proxy, not the visitor,
    # so every user would share one rate-limit bucket. Render appends its own
    # entries to the END of X-Forwarded-For and keeps whatever the caller sent at
    # the front, so only the last few entries can be trusted. TRUSTED_PROXY_COUNT
    # says how many from the right to count (default 2 in production, 0 locally).
    # If the header is shorter than that, the address is left untouched.
    default_proxies = "2" if os.environ.get("FLASK_ENV") == "production" else "0"
    try:
        trusted_proxies = max(0, int(os.environ.get("TRUSTED_PROXY_COUNT", default_proxies)))
    except ValueError:
        trusted_proxies = 0
    if trusted_proxies:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=trusted_proxies)

    db.init_app(app)
    Migrate(app, db)

    if os.environ.get("FLASK_ENV") == "production":
        if not os.environ.get("FRONTEND_URL"):
            # Falling back to "*" lets any website call this API from a
            # visitor's browser. Auth still protects the data, but the
            # setting is almost certainly an oversight, so say so loudly.
            logger.warning(
                "FRONTEND_URL is not set in production: CORS is open to every origin. "
                "Set FRONTEND_URL to your frontend's address (e.g. https://your-app.vercel.app)."
            )
        # The iOS and Android apps load the site from these built-in addresses,
        # so the browser rules must let them call the API as well.
        native_origins = ["capacitor://localhost", "https://localhost"]
        CORS(app, origins=[os.environ.get("FRONTEND_URL", "*"), *native_origins], expose_headers=["X-Request-ID"])
    else:
        CORS(app, expose_headers=["X-Request-ID"])

    # In-memory storage is per-process, not per-instance: gunicorn already
    # runs 2 worker processes (see Dockerfile), so even today, on a single
    # Render instance, "60 per minute" is actually up to 120/minute split
    # unevenly across whichever worker a request happens to land on — the
    # limit was never reliably enforced per-user to begin with. REDIS_URL
    # (optional — e.g. a free Upstash/Render Redis instance) gives every
    # worker (and every instance, if this ever scales horizontally) a
    # shared view of each caller's request count; unset, it falls back to
    # the same in-memory behavior as before rather than failing to start.
    redis_url = os.environ.get("REDIS_URL")
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["60 per minute"],
        storage_uri=redis_url or "memory://",
        headers_enabled=True,
    )
    app.extensions["limiter"] = limiter

    # ---------------- HEALTH ----------------

    @app.route("/health", methods=["GET"])
    def health():
        # "commit" lets a post-deploy check confirm the NEW version (not the
        # one it replaced) is the one answering. Render sets
        # RENDER_GIT_COMMIT at runtime; it is simply absent elsewhere.
        commit = (os.environ.get("RENDER_GIT_COMMIT") or "")[:12] or None
        try:
            db.session.execute(db.text("SELECT 1"))
            return jsonify({"status": "ok", "commit": commit}), 200
        except Exception:
            return jsonify({"status": "degraded", "commit": commit}), 503

    # ---------------- REQUEST ID + STANDARDIZED ERRORS ----------------

    @app.before_request
    def _assign_request_id():
        g.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    @app.after_request
    def _attach_request_id(response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        return response

    @app.after_request
    def _security_headers(response):
        """Skips /internal/* — those are cron-triggered, never rendered by a
        browser (except /internal/unsubscribe, a one-click HTML page opened
        from an email; left out of scope here same as the rest of /internal).
        default-src 'none' rather than a script/style-permissive CSP: this
        backend only ever returns JSON, so there's nothing legitimate for a
        browser to load even in the edge case of someone navigating directly
        to an API URL."""
        if not request.path.startswith("/internal/"):
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Content-Security-Policy"] = "default-src 'none'"
        return response

    def _error_payload(message, status, code=None, details=None):
        return {
            "error": message,
            "code": code or _ERROR_CODES.get(status, "error"),
            "request_id": getattr(g, "request_id", None),
            "details": details,
        }

    @app.errorhandler(HTTPException)
    def _handle_http_exception(err):
        return jsonify(_error_payload(err.description or err.name, err.code)), err.code

    @app.errorhandler(Exception)
    def _handle_unexpected_exception(err):
        logger.exception("Unhandled exception (request_id=%s)", getattr(g, "request_id", None))
        if sentry_dsn:
            sentry_sdk.capture_exception(err)
        return jsonify(_error_payload("An unexpected error occurred", 500)), 500

    # ---------------- SCOPE / AUTHORIZATION HELPERS ----------------

    def scoped_holdings_query(household_id_param):
        """Base query for the caller's viewable holdings.
        No household_id param -> the caller's own holdings.
        household_id param -> that household's shared (non-private) holdings,
        visible to any member (owner/editor/viewer)."""
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403, description="Not a member of this household")
            return Holding.query.filter(
                Holding.household_id == household_id_param,
                Holding.is_private == False,  # noqa: E712
                Holding.deleted_at.is_(None),
            )
        return Holding.query.filter(Holding.user_id == g.user_id, Holding.deleted_at.is_(None))

    def get_authorized_holding(holding_id, require_write=False):
        """Fetch a holding the caller may read (owner, or a household member
        with a non-private holding) or write (owner, or owner/editor role on
        a non-private holding -- private is enforced on writes too, or an
        editor could read-via-write: DELETE/PUT-with-is_private-false a
        holding they were never allowed to see)."""
        holding = Holding.query.get_or_404(holding_id)
        if holding.deleted_at is not None:
            abort(404)
        if str(holding.user_id) == str(g.user_id):
            return holding
        if holding.household_id:
            role = get_role(str(holding.household_id), g.user_id)
            if role and not holding.is_private:
                if require_write and role in ("owner", "editor"):
                    return holding
                if not require_write:
                    return holding
        abort(403)

    def scoped_liabilities_query(household_id_param):
        """Same shape as scoped_holdings_query, for liabilities."""
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403, description="Not a member of this household")
            return Liability.query.filter(
                Liability.household_id == household_id_param, Liability.is_private == False  # noqa: E712
            )
        return Liability.query.filter(Liability.user_id == g.user_id)

    def get_authorized_liability(liability_id, require_write=False):
        liability = Liability.query.get_or_404(liability_id)
        if str(liability.user_id) == str(g.user_id):
            return liability
        if liability.household_id:
            role = get_role(str(liability.household_id), g.user_id)
            if role and not liability.is_private:
                if require_write and role in ("owner", "editor"):
                    return liability
                if not require_write:
                    return liability
        abort(403)

    def validate_household_id_for_write(household_id):
        if not household_id:
            return
        if not can_edit_household(household_id, g.user_id):
            abort(403, description="You need editor access to this household")

    def validate_household_reassignment(record_user_id, new_household_id):
        """For moving an existing record into a household (not just creating
        one there): the caller being able to edit the target household isn't
        enough on its own, or a shared editor could reassign someone else's
        record into an unrelated household that person never joined --
        exposing it to people with no relationship to its actual owner.
        The record's owner must already belong to the target household."""
        if not new_household_id:
            return
        validate_household_id_for_write(new_household_id)
        if str(new_household_id) not in get_member_household_ids(record_user_id):
            abort(403, description="That household doesn't include this record's owner")

    def require_ai_access(household_id_param):
        """AI features are restricted to owner/editor household roles. A
        caller viewing their own data (no household_id) always has access —
        there's no lesser role to check against."""
        if not household_id_param:
            return
        role = get_role(household_id_param, g.user_id)
        if role not in ("owner", "editor"):
            abort(403, description="AI features require owner or editor access to this household")

    def get_authorized_transaction(transaction_id, require_write=False):
        tx = HoldingTransaction.query.get_or_404(transaction_id)
        if tx.deleted_at is not None:
            abort(404)
        get_authorized_holding(tx.holding_id, require_write=require_write)
        return tx

    # ---------------- HOLDINGS ----------------

    @app.route("/holdings", methods=["POST"])
    @require_auth
    def create_holding():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        required = ("asset_type", "name", "country", "account", "currency")
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({"error": f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required"}), 400
        sip_frequency = data.get("sip_frequency")
        if sip_frequency and sip_frequency not in ("weekly", "monthly", "quarterly"):
            return jsonify({"error": "sip_frequency must be weekly, monthly, or quarterly"}), 400

        holding = Holding(
            user_id=g.user_id,
            household_id=household_id,
            asset_type=data["asset_type"],
            symbol=data.get("symbol"),
            name=data["name"],
            country=data["country"],
            account=data["account"],
            institution=data.get("institution"),
            currency=data["currency"],
            interest_rate=data.get("interest_rate"),
            maturity_date=date.fromisoformat(data["maturity_date"]) if data.get("maturity_date") else None,
            sip_amount=data.get("sip_amount"),
            sip_frequency=sip_frequency,
            sip_start_date=date.fromisoformat(data["sip_start_date"]) if data.get("sip_start_date") else None,
            is_private=bool(data.get("is_private", False)),
            notes=data.get("notes"),
            tags=data.get("tags"),
        )
        db.session.add(holding)
        db.session.commit()
        return jsonify(holding.to_dict()), 201

    @app.route("/holdings", methods=["GET"])
    @require_auth
    def get_holdings():
        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        query = scoped_holdings_query(household_id_param)

        asset_type = request.args.get("asset_type")
        if asset_type:
            query = query.filter(Holding.asset_type == asset_type)
        country = request.args.get("country")
        if country:
            query = query.filter(Holding.country == country)

        query = query.order_by(Holding.created_at.desc())

        # Same opt-in pagination as /transactions — omitting ?page= keeps
        # every existing caller (which expects a plain array) working
        # unchanged.
        page_param = request.args.get("page")
        if page_param:
            page = max(1, int(page_param))
            per_page = min(200, max(1, int(request.args.get("per_page", 50))))
            total = query.count()
            holdings = query.offset((page - 1) * per_page).limit(per_page).all()
        else:
            total = None
            holdings = query.all()

        results = list_holdings_with_metrics(holdings, display_currency=display_currency)
        if request.args.get("summary") == "true":
            results = [to_summary(r) for r in results]

        if total is None:
            return jsonify(results)
        return jsonify({
            "items": results,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        })

    @app.route("/holdings/<int:holding_id>", methods=["GET"])
    @require_auth
    def get_holding(holding_id):
        holding = get_authorized_holding(holding_id)
        display_currency = request.args.get("currency", "USD").upper()
        [metrics] = list_holdings_with_metrics([holding], display_currency=display_currency)
        return jsonify(metrics)

    @app.route("/holdings/<int:holding_id>", methods=["PUT"])
    @require_auth
    def update_holding(holding_id):
        holding = get_authorized_holding(holding_id, require_write=True)
        data = request.get_json(force=True)

        if "household_id" in data:
            validate_household_reassignment(holding.user_id, data["household_id"])
            holding.household_id = data["household_id"]
        for field in ("asset_type", "symbol", "name", "country", "account", "institution", "currency", "notes", "tags", "status"):
            if field in data:
                setattr(holding, field, data[field])
        if "interest_rate" in data:
            holding.interest_rate = data["interest_rate"]
        if "maturity_date" in data:
            holding.maturity_date = date.fromisoformat(data["maturity_date"]) if data["maturity_date"] else None
        if "is_private" in data:
            holding.is_private = bool(data["is_private"])
        if "sip_amount" in data:
            holding.sip_amount = data["sip_amount"]
        if "sip_frequency" in data:
            if data["sip_frequency"] and data["sip_frequency"] not in ("weekly", "monthly", "quarterly"):
                return jsonify({"error": "sip_frequency must be weekly, monthly, or quarterly"}), 400
            holding.sip_frequency = data["sip_frequency"]
        if "sip_start_date" in data:
            holding.sip_start_date = date.fromisoformat(data["sip_start_date"]) if data["sip_start_date"] else None

        db.session.commit()
        [metrics] = list_holdings_with_metrics([holding])
        return jsonify(metrics)

    @app.route("/holdings/<int:holding_id>", methods=["DELETE"])
    @require_auth
    def delete_holding(holding_id):
        holding = get_authorized_holding(holding_id, require_write=True)
        now = datetime.utcnow()
        holding.deleted_at = now
        # Soft-delete live transactions so they disappear from position calcs.
        HoldingTransaction.query.filter_by(holding_id=holding.id).filter(
            HoldingTransaction.deleted_at.is_(None)
        ).update({"deleted_at": now}, synchronize_session=False)
        db.session.commit()
        return jsonify({"message": "Holding deleted"}), 200

    @app.route("/holdings/<int:holding_id>/sip-projection", methods=["GET"])
    @require_auth
    def sip_projection(holding_id):
        holding = get_authorized_holding(holding_id)
        if not holding.sip_amount or not holding.sip_frequency or not holding.sip_start_date:
            return jsonify({"error": "This holding isn't set up as a SIP yet"}), 400

        years = safe_float(request.args.get("years", 10))
        [metrics] = list_holdings_with_metrics([holding])

        upcoming = next_sip_occurrences(holding.sip_start_date, holding.sip_frequency, count=3)
        projection = project_sip_future_value(
            current_value=metrics.get("current_value", 0.0),
            sip_amount=holding.sip_amount,
            frequency=holding.sip_frequency,
            annual_rate=metrics.get("xirr"),
            years=years,
        )
        return jsonify({"upcoming_dates": upcoming, "years": years, **projection})

    # ---------------- ACCOUNTS (a registry of Holding.account names) ----------------


    # ---------------- TRANSACTIONS (buy/sell ledger) ----------------

    @app.route("/holdings/<int:holding_id>/transactions", methods=["GET"])
    @require_auth
    def list_holding_transactions(holding_id):
        get_authorized_holding(holding_id)
        txs = (
            HoldingTransaction.query.filter_by(holding_id=holding_id)
            .filter(HoldingTransaction.deleted_at.is_(None))
            .order_by(HoldingTransaction.transaction_date.desc())
            .all()
        )
        return jsonify([t.to_dict() for t in txs])

    @app.route("/holdings/<int:holding_id>/transactions", methods=["POST"])
    @require_auth
    def create_holding_transaction(holding_id):
        holding = get_authorized_holding(holding_id, require_write=True)
        data = request.get_json(force=True)
        if data.get("transaction_type") not in TRANSACTION_TYPES:
            return jsonify({"error": f"transaction_type must be one of {list(TRANSACTION_TYPES)}"}), 400
        missing = [f for f in ("transaction_date", "quantity", "price_per_unit") if data.get(f) in (None, "")]
        if missing:
            return jsonify({"error": f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required"}), 400
        tx = HoldingTransaction(
            holding_id=holding_id,
            user_id=g.user_id,
            transaction_type=data["transaction_type"],
            transaction_date=date.fromisoformat(data["transaction_date"]),
            quantity=safe_float(data["quantity"]),
            price_per_unit=safe_float(data["price_per_unit"]),
            currency=data.get("currency", holding.currency),
            fees=safe_float(data.get("fees", 0)),
            notes=data.get("notes"),
        )
        db.session.add(tx)

        funding_valuation = None
        funding_source_id = data.get("funding_source_holding_id")
        if funding_source_id and tx.transaction_type == "buy":
            source_holding = get_authorized_holding(funding_source_id, require_write=True)
            source_valuations = HoldingValuation.query.filter_by(holding_id=source_holding.id).all()
            total_cost = tx.quantity * tx.price_per_unit + tx.fees
            try:
                funding_valuation = build_funding_valuation(
                    source_holding, source_valuations, total_cost, tx.currency, tx.transaction_date, g.user_id
                )
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
            db.session.add(funding_valuation)

        db.session.commit()
        return jsonify({**tx.to_dict(), "funding_source": funding_valuation.to_dict() if funding_valuation else None}), 201

    @app.route("/transactions/<int:transaction_id>", methods=["PUT"])
    @require_auth
    def update_transaction(transaction_id):
        tx = get_authorized_transaction(transaction_id, require_write=True)
        data = request.get_json(force=True)
        if "transaction_type" in data:
            if data["transaction_type"] not in TRANSACTION_TYPES:
                return jsonify({"error": f"transaction_type must be one of {list(TRANSACTION_TYPES)}"}), 400
            tx.transaction_type = data["transaction_type"]
        if "transaction_date" in data:
            tx.transaction_date = date.fromisoformat(data["transaction_date"])
        if "quantity" in data:
            tx.quantity = safe_float(data["quantity"])
        if "price_per_unit" in data:
            tx.price_per_unit = safe_float(data["price_per_unit"])
        if "fees" in data:
            tx.fees = safe_float(data["fees"])
        if "notes" in data:
            tx.notes = data["notes"]
        if "tags" in data:
            tx.tags = data["tags"]
        db.session.commit()
        return jsonify(tx.to_dict())

    @app.route("/transactions/<int:transaction_id>", methods=["DELETE"])
    @require_auth
    def delete_transaction(transaction_id):
        tx = get_authorized_transaction(transaction_id, require_write=True)
        tx.deleted_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"message": "Transaction deleted"}), 200

    @app.route("/transactions", methods=["GET"])
    @require_auth
    def list_all_transactions():
        """Global transaction log, filterable by asset type / date range / country."""
        household_id_param = request.args.get("household_id")
        holdings = scoped_holdings_query(household_id_param).all()
        holdings_by_id = {h.id: h for h in holdings}

        asset_type = request.args.get("asset_type")
        country = request.args.get("country")
        search = (request.args.get("search") or "").strip().lower()
        matching_ids = [
            h.id for h in holdings
            if (not asset_type or h.asset_type == asset_type)
            and (not country or h.country == country)
            and (not search or search in (h.symbol or "").lower() or search in h.name.lower())
        ]

        query = HoldingTransaction.query.filter(
            HoldingTransaction.holding_id.in_(matching_ids),
            HoldingTransaction.deleted_at.is_(None),
        )

        date_from = request.args.get("date_from")
        if date_from:
            query = query.filter(HoldingTransaction.transaction_date >= date.fromisoformat(date_from))
        date_to = request.args.get("date_to")
        if date_to:
            query = query.filter(HoldingTransaction.transaction_date <= date.fromisoformat(date_to))

        query = query.order_by(HoldingTransaction.transaction_date.desc())

        # Pagination is opt-in via ?page=: omitting it returns the full
        # array exactly as before (every existing caller keeps working
        # unchanged). A transaction log can grow into the thousands over
        # years of use, so a caller that does want to page through it
        # rather than fetch everything at once can with ?page=&per_page=.
        page_param = request.args.get("page")
        if page_param:
            page = max(1, int(page_param))
            per_page = min(200, max(1, int(request.args.get("per_page", 50))))
            total = query.count()
            txs = query.offset((page - 1) * per_page).limit(per_page).all()
        else:
            total = None
            txs = query.all()

        results = []
        for t in txs:
            holding = holdings_by_id.get(t.holding_id)
            results.append({
                **t.to_dict(),
                "holding_name": holding.name if holding else None,
                "holding_symbol": holding.symbol if holding else None,
                "asset_type": holding.asset_type if holding else None,
                "country": holding.country if holding else None,
            })

        if total is None:
            return jsonify(results)
        return jsonify({
            "items": results,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if per_page else 0,
        })

    # ---------------- VALUATIONS (non-tradeable holdings) ----------------

    @app.route("/holdings/<int:holding_id>/valuations", methods=["GET"])
    @require_auth
    def list_holding_valuations(holding_id):
        get_authorized_holding(holding_id)
        vals = (
            HoldingValuation.query.filter_by(holding_id=holding_id)
            .order_by(HoldingValuation.valuation_date.desc())
            .all()
        )
        return jsonify([v.to_dict() for v in vals])

    @app.route("/holdings/<int:holding_id>/valuations", methods=["POST"])
    @require_auth
    def create_holding_valuation(holding_id):
        holding = get_authorized_holding(holding_id, require_write=True)
        data = request.get_json(force=True)
        missing = [f for f in ("valuation_date", "value") if data.get(f) in (None, "")]
        if missing:
            return jsonify({"error": f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} required"}), 400
        val = HoldingValuation(
            holding_id=holding_id,
            user_id=g.user_id,
            valuation_date=date.fromisoformat(data["valuation_date"]),
            value=safe_float(data["value"]),
            currency=data.get("currency", holding.currency),
            notes=data.get("notes"),
        )
        db.session.add(val)
        db.session.commit()
        return jsonify(val.to_dict()), 201

    @app.route("/valuations/<int:valuation_id>", methods=["DELETE"])
    @require_auth
    def delete_valuation(valuation_id):
        val = HoldingValuation.query.get_or_404(valuation_id)
        get_authorized_holding(val.holding_id, require_write=True)
        db.session.delete(val)
        db.session.commit()
        return jsonify({"message": "Valuation deleted"}), 200

    # ---------------- PRICE HISTORY / LOOKUP ----------------

    @app.route("/holdings/<int:holding_id>/price-history", methods=["GET"])
    @require_auth
    def get_holding_price_history(holding_id):
        holding = get_authorized_holding(holding_id)
        if holding.asset_type not in ("stock", "mutual_fund", "crypto", "commodity") or not holding.symbol:
            return jsonify([])
        rows = (
            PriceHistory.query.filter_by(asset_type=holding.asset_type, symbol=holding.symbol)
            .order_by(PriceHistory.price_date.asc())
            .all()
        )
        return jsonify([r.to_dict() for r in rows])

    @app.route("/price-lookup", methods=["GET"])
    @require_auth
    def price_lookup():
        """Used by the Add Transaction form's 'fetch historical price' button."""
        asset_type = request.args.get("asset_type", "")
        symbol = request.args.get("symbol", "")
        target_date = request.args.get("date")
        currency = request.args.get("currency", "USD")
        if not asset_type or not symbol:
            return jsonify({"error": "asset_type and symbol are required"}), 400

        if target_date:
            price = price_service.get_historical_price(asset_type, symbol, date.fromisoformat(target_date), currency)
        else:
            price = price_service.get_current_price(asset_type, symbol, currency)

        return jsonify({"price": price})

    # ---------------- DASHBOARD ----------------

    @app.route("/dashboard", methods=["GET"])
    @require_auth
    def get_dashboard():
        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        holdings = scoped_holdings_query(household_id_param).all()
        holdings_by_id = {h.id: h for h in holdings}
        holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency=display_currency)
        all_transactions = HoldingTransaction.query.filter(
            HoldingTransaction.holding_id.in_([h.id for h in holdings]),
            HoldingTransaction.deleted_at.is_(None),
        ).all()
        liabilities = scoped_liabilities_query(household_id_param).all()
        total_liabilities = total_liabilities_display(liabilities, display_currency=display_currency)
        return jsonify(build_dashboard(
            holdings_with_metrics, holdings_by_id, display_currency=display_currency,
            all_transactions=all_transactions, total_liabilities=total_liabilities,
        ))

    # ---------------- EXCHANGE RATES ----------------

    @app.route("/exchange-rates", methods=["GET"])
    @require_auth
    def get_exchange_rates():
        base = request.args.get("base", "USD").upper()
        targets = ["USD", "INR", "AUD"]
        rates = {t: (1.0 if t == base else price_service.get_rate(base, t)) for t in targets}
        return jsonify({"base": base, "rates": rates})

    @app.route("/price-cache-status", methods=["GET"])
    @require_auth
    def price_cache_status():
        return jsonify(price_service.get_cache_status())

    # ---------------- BENCHMARK COMPARISON ----------------

    @app.route("/benchmark", methods=["GET"])
    @require_auth
    def get_benchmark():
        symbol = request.args.get("symbol", "SPY")
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        result = get_benchmark_comparison(
            g.user_id if not household_id_param else None, symbol, household_id_param
        )
        if result is None:
            return jsonify({"error": "Not enough transaction/price data to compute a comparison"}), 404
        return jsonify(result)

    # ---------------- TAX SUMMARY ----------------

    @app.route("/tax-summary", methods=["GET"])
    @require_auth
    def tax_summary():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        cost_basis_method = request.args.get("cost_basis_method", "average")
        if cost_basis_method not in COST_BASIS_METHODS:
            return jsonify({"error": f"cost_basis_method must be one of {COST_BASIS_METHODS}"}), 400
        result = get_tax_summary(
            g.user_id if not household_id_param else None, household_id_param, cost_basis_method=cost_basis_method
        )
        return jsonify({"rows": result, "disclaimer": TAX_DISCLAIMER, "cost_basis_method": cost_basis_method})

    # ---------------- INCOME (dividends and interest) ----------------

    @app.route("/income-summary", methods=["GET"])
    @require_auth
    def income_summary():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        display_currency = request.args.get("currency", "USD").upper()
        return jsonify(
            get_income_summary(
                g.user_id if not household_id_param else None, household_id_param, display_currency=display_currency
            )
        )

    # ---------------- PRICE ALERTS ----------------


    # ---------------- CSV IMPORT ----------------
    # The broker-specific importer (Zerodha/Groww/Fidelity/Robinhood) was
    # removed in favor of one simple deterministic format below -- no
    # broker picker, and no AI call for the common case.


    # ---------------- NET WORTH HISTORY (real daily snapshots) ----------------


    # ---------------- HOUSEHOLDS ----------------


    # ---------------- INTERNAL: DAILY SNAPSHOT / WEEKLY DIGEST TRIGGERS ----------------


    # ---------------- SEARCH SYMBOLS (AUTOCOMPLETE) ----------------


    # ---------------- AI FEATURES (owner/editor only, graceful when unconfigured) ----------------


    # ---------------- GOALS ----------------


    # ---------------- LIABILITIES ----------------


    # ---------------- MILESTONES (auto-detected, from the daily snapshot job) ----------------


    # ---------------- ACCOUNT DATA (Settings page: export / danger zone) ----------------


    # ---------------- BUDGET (income / expenses — independent of net worth) ----------------


    h = SimpleNamespace(
        get_authorized_holding=get_authorized_holding,
        get_authorized_liability=get_authorized_liability,
        get_authorized_transaction=get_authorized_transaction,
        require_ai_access=require_ai_access,
        scoped_holdings_query=scoped_holdings_query,
        scoped_liabilities_query=scoped_liabilities_query,
        validate_household_id_for_write=validate_household_id_for_write,
        validate_household_reassignment=validate_household_reassignment,
    )
    register_all(app, h)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5001)
