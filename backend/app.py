from datetime import date
import hmac
import json
import logging
import os
import uuid
from flask import Flask, jsonify, request, g, abort, Response
from flask_cors import CORS
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException
import requests

from .models import db, Holding, HoldingTransaction, HoldingValuation, PriceHistory, PriceAlert, BudgetEntry, BudgetLimit, Liability, Milestone
from .auth import require_auth
from .utils import FINNHUB_API_KEY
from .services import safe_float, rank_symbol_results
from . import price_service
from . import ai_service
from .allocation_service import compute_rebalance_plan, validate_target_allocation
from .allocation_target_service import get_target_allocation, save_target_allocation, clear_target_allocation
from .holdings_service import list_holdings_with_metrics, build_dashboard, to_summary, get_monthly_net_flow, build_funding_valuation, TRANSACTION_TYPES
from .liability_service import list_liabilities_with_display, total_liabilities_display, LIABILITY_TYPES
from .household_service import (
    get_member_household_ids,
    get_role,
    can_edit_household,
    create_household,
    list_my_households,
    list_members_with_email,
    create_invite,
    list_my_pending_invites,
    accept_invite,
    leave_household,
    remove_member,
    delete_household,
)
from .snapshot_service import snapshot_all_users
from .digest_service import build_weekly_digest
from .alert_service import check_all_alerts
from .unsubscribe_service import verify_unsubscribe_token, unsubscribe as unsubscribe_email
from .account_service import export_user_data, export_user_data_csv_zip, delete_all_user_data
from .goal_service import list_goals, create_goal, update_goal, delete_goal
from .milestone_service import list_milestones
from .sip_service import next_occurrences as next_sip_occurrences, project_future_value as project_sip_future_value
from .budget_service import (
    get_monthly_summary,
    get_subscriptions,
    get_limits,
    set_limit,
    delete_limit,
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
)
from .smart_import_service import parse_spreadsheet, confirm_smart_import
from .bank_import_service import parse_statement, confirm_bank_import
from .benchmark_service import get_benchmark_comparison
from .tax_service import get_tax_summary, TAX_DISCLAIMER, COST_BASIS_METHODS
from .csv_import_service import parse_csv, confirm_import, SUPPORTED_BROKERS

# Import mf instance if available
try:
    from .utils import mf, MFTOOL_AVAILABLE
except (ImportError, AttributeError):
    mf = None
    MFTOOL_AVAILABLE = False

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

    db.init_app(app)
    Migrate(app, db)

    if os.environ.get("FLASK_ENV") == "production":
        CORS(app, origins=[os.environ.get("FRONTEND_URL", "*")], expose_headers=["X-Request-ID"])
    else:
        CORS(app, expose_headers=["X-Request-ID"])

    # In-memory storage: fine for a single Render instance (matches the
    # no-Redis decision); resets on deploy/restart and won't share state
    # across multiple workers/instances if the app ever scales out.
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["60 per minute"],
        storage_uri="memory://",
        headers_enabled=True,
    )
    app.extensions["limiter"] = limiter

    # ---------------- REQUEST ID + STANDARDIZED ERRORS ----------------

    @app.before_request
    def _assign_request_id():
        g.request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    @app.after_request
    def _attach_request_id(response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
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
                Holding.household_id == household_id_param, Holding.is_private == False  # noqa: E712
            )
        return Holding.query.filter(Holding.user_id == g.user_id)

    def get_authorized_holding(holding_id, require_write=False):
        """Fetch a holding the caller may read (owner, or a household member
        with a non-private holding) or write (owner, or owner/editor role)."""
        holding = Holding.query.get_or_404(holding_id)
        if str(holding.user_id) == str(g.user_id):
            return holding
        if holding.household_id:
            role = get_role(str(holding.household_id), g.user_id)
            if role:
                if require_write and role in ("owner", "editor"):
                    return holding
                if not require_write and not holding.is_private:
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
            if role:
                if require_write and role in ("owner", "editor"):
                    return liability
                if not require_write and not liability.is_private:
                    return liability
        abort(403)

    def validate_household_id_for_write(household_id):
        if not household_id:
            return
        if not can_edit_household(household_id, g.user_id):
            abort(403, description="You need editor access to this household")

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
        get_authorized_holding(tx.holding_id, require_write=require_write)
        return tx

    # ---------------- HOLDINGS ----------------

    @app.route("/holdings", methods=["POST"])
    @require_auth
    def create_holding():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

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
            sip_frequency=data.get("sip_frequency"),
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

        holdings = query.order_by(Holding.created_at.desc()).all()
        results = list_holdings_with_metrics(holdings, display_currency=display_currency)
        if request.args.get("summary") == "true":
            results = [to_summary(r) for r in results]
        return jsonify(results)

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
            validate_household_id_for_write(data["household_id"])
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
        db.session.delete(holding)
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

    # ---------------- TRANSACTIONS (buy/sell ledger) ----------------

    @app.route("/holdings/<int:holding_id>/transactions", methods=["GET"])
    @require_auth
    def list_holding_transactions(holding_id):
        get_authorized_holding(holding_id)
        txs = (
            HoldingTransaction.query.filter_by(holding_id=holding_id)
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
        db.session.delete(tx)
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
        matching_ids = [
            h.id for h in holdings
            if (not asset_type or h.asset_type == asset_type)
            and (not country or h.country == country)
        ]

        query = HoldingTransaction.query.filter(HoldingTransaction.holding_id.in_(matching_ids))

        date_from = request.args.get("date_from")
        if date_from:
            query = query.filter(HoldingTransaction.transaction_date >= date.fromisoformat(date_from))
        date_to = request.args.get("date_to")
        if date_to:
            query = query.filter(HoldingTransaction.transaction_date <= date.fromisoformat(date_to))

        txs = query.order_by(HoldingTransaction.transaction_date.desc()).all()
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
        return jsonify(results)

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
            HoldingTransaction.holding_id.in_([h.id for h in holdings])
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

    # ---------------- PRICE ALERTS ----------------

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
        alert = PriceAlert(
            user_id=g.user_id,
            holding_id=data.get("holding_id"),
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

    # ---------------- CSV IMPORT ----------------

    @app.route("/import/brokers", methods=["GET"])
    @require_auth
    def list_import_brokers():
        return jsonify(SUPPORTED_BROKERS)

    @app.route("/import/parse", methods=["POST"])
    @require_auth
    def import_parse():
        data = request.get_json(force=True)
        broker = data.get("broker")
        csv_text = data.get("csv_text")
        if not broker or not csv_text:
            return jsonify({"error": "broker and csv_text are required"}), 400
        result = parse_csv(broker, csv_text)
        return jsonify(result)

    @app.route("/import/confirm", methods=["POST"])
    @require_auth
    def import_confirm():
        data = request.get_json(force=True)
        rows = data.get("rows", [])
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        if not rows:
            return jsonify({"error": "No rows to import"}), 400
        result = confirm_import(g.user_id, rows, household_id=household_id)
        return jsonify(result), 201

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

    # ---------------- NET WORTH HISTORY (real daily snapshots) ----------------

    @app.route("/net-worth-history", methods=["GET"])
    @require_auth
    def get_net_worth_history():
        """Real daily snapshots for the caller (or a shared household via
        ?household_id=). Empty until the daily snapshot job has run a few times.
        Snapshots are always stored in USD (see snapshot_service.py), so this
        converts to ?currency= (default USD) before returning — otherwise a
        user on a non-USD display currency would see raw USD figures under
        their currency's symbol, off by the exchange rate."""
        from .models import NetWorthSnapshot

        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403)
            rows = NetWorthSnapshot.query.filter_by(household_id=household_id_param)
        else:
            rows = NetWorthSnapshot.query.filter_by(user_id=g.user_id)

        rows = rows.order_by(NetWorthSnapshot.snapshot_date.asc()).all()

        def convert_row(r):
            d = r.to_dict()
            from_currency = d["currency"] or "USD"
            for field in ("total_net_worth", "total_stock_value", "total_property_value", "total_profit_loss", "total_liabilities"):
                d[field] = price_service.convert(d[field], from_currency, display_currency)
            d["by_asset_type"] = {
                k: price_service.convert(v, from_currency, display_currency) for k, v in d["by_asset_type"].items()
            }
            d["currency"] = display_currency
            return d

        return jsonify([convert_row(r) for r in rows])

    @app.route("/monthly-flow", methods=["GET"])
    @require_auth
    def get_monthly_flow():
        """Net cash flow per month per asset type — how much money moved
        into/out of each type, not the type's total value. See
        holdings_service.get_monthly_net_flow for the exact math."""
        household_id_param = request.args.get("household_id")
        holdings = scoped_holdings_query(household_id_param).all()
        holding_ids = [h.id for h in holdings]

        transactions = HoldingTransaction.query.filter(HoldingTransaction.holding_id.in_(holding_ids)).all()
        valuations = HoldingValuation.query.filter(HoldingValuation.holding_id.in_(holding_ids)).all()

        currency = request.args.get("currency", "USD").upper()
        months = int(request.args.get("months", 12))
        result = get_monthly_net_flow(holdings, transactions, valuations, display_currency=currency, months=months)
        return jsonify(result)

    # ---------------- HOUSEHOLDS ----------------

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
        return jsonify(invite.to_dict())

    @app.route("/households/<uuid:household_id>/leave", methods=["POST"])
    @require_auth
    def leave_household_route(household_id):
        try:
            leave_household(str(household_id), g.user_id)
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        return jsonify({"message": "Left household"})

    @app.route("/households/<uuid:household_id>/members/<uuid:target_user_id>", methods=["DELETE"])
    @require_auth
    def remove_member_route(household_id, target_user_id):
        try:
            remove_member(str(household_id), g.user_id, str(target_user_id))
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
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
        return jsonify({"message": "Household deleted"})

    # ---------------- INTERNAL: DAILY SNAPSHOT / WEEKLY DIGEST TRIGGERS ----------------

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
        digests = build_weekly_digest()
        return jsonify({"digests_built": len(digests)}), 200

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
        return f"<p>{email} has been unsubscribed from the weekly net worth digest.</p>", 200

    @app.route("/internal/check-alerts", methods=["POST"])
    @limiter.limit("10 per minute")
    def trigger_check_alerts():
        """Called every few hours by a GitHub Actions cron workflow."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or not provided or not hmac.compare_digest(provided, SNAPSHOT_SECRET):
            return jsonify({"error": "Unauthorized"}), 401
        result = check_all_alerts()
        return jsonify(result), 200

    # ---------------- SEARCH SYMBOLS (AUTOCOMPLETE) ----------------

    @app.route("/search-symbols", methods=["GET"])
    @require_auth
    def search_symbols():
        """
        Search for stock symbols using Finnhub (US), NSE (India), and AMFI (India mutual funds).
        Returns matching symbols for autocomplete functionality.
        """
        query = request.args.get("q", "").strip().upper()
        country = request.args.get("country", "").strip()
        asset_type = request.args.get("asset_type", "").strip()

        if not query or len(query) < 1:
            return jsonify([])

        results = []

        if asset_type == "mutual_fund":
            if not country or country == "India":
                mf_results = _search_mutual_fund_symbols(query)
                results.extend(mf_results)
        else:
            if not country or country == "United States":
                finnhub_results = _search_finnhub_symbols(query)
                results.extend(finnhub_results)

            if not country or country == "India":
                nse_results = _search_nse_symbols(query)
                results.extend(nse_results)

                mf_results = _search_mutual_fund_symbols(query)
                results.extend(mf_results)

        seen = set()
        unique_results = []

        if asset_type == "mutual_fund":
            for result in results:
                if result.get("exchange") == "AMFI":
                    key = (result["symbol"], result.get("exchange", ""))
                    if key not in seen:
                        seen.add(key)
                        unique_results.append(result)
            for result in results:
                key = (result["symbol"], result.get("exchange", ""))
                if key not in seen:
                    seen.add(key)
                    unique_results.append(result)
        else:
            for result in results:
                key = (result["symbol"], result.get("exchange", ""))
                if key not in seen:
                    seen.add(key)
                    unique_results.append(result)

        unique_results = rank_symbol_results(unique_results, query)
        return jsonify(unique_results[:20])

    @app.route("/search-crypto", methods=["GET"])
    @require_auth
    def search_crypto():
        """Search CoinGecko's coin list for the Add Holding form's crypto autocomplete."""
        query = request.args.get("q", "").strip().lower()
        if not query:
            return jsonify([])
        try:
            response = requests.get("https://api.coingecko.com/api/v3/search", params={"query": query}, timeout=5)
            response.raise_for_status()
            coins = response.json().get("coins", [])[:10]
            return jsonify([
                {"symbol": c["id"], "displaySymbol": c.get("symbol", "").upper(), "description": c.get("name", "")}
                for c in coins
            ])
        except Exception as e:
            print(f"CoinGecko search failed: {e}")
            return jsonify([])

    def _search_finnhub_symbols(query):
        if not FINNHUB_API_KEY:
            return []
        try:
            url = "https://finnhub.io/api/v1/search"
            params = {"q": query, "token": FINNHUB_API_KEY}
            response = requests.get(url, params=params, timeout=3)
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("result", [])[:10]:
                symbol = item.get("symbol", "")
                display_symbol = item.get("displaySymbol", symbol)
                description = item.get("description", "")
                symbol_type = item.get("type", "")

                if symbol_type in ("Common Stock", "EQS", "Stock") or not symbol_type:
                    results.append({
                        "symbol": symbol,
                        "displaySymbol": display_symbol,
                        "description": description,
                        "exchange": "US",
                        "country": "United States",
                    })
            return results
        except Exception as e:
            print(f"Finnhub symbol search failed: {e}")
            return []

    def _search_nse_symbols(query):
        """Yahoo Finance's unofficial search endpoint — same undocumented
        API already relied on for NSE price fetching (see
        utils.get_historical_price_from_yahoo), covers the full NSE listing
        rather than a hardcoded handful of large-caps. NSE also lists BSE
        cross-listings for the same company (symbol.BO); only NSE (.NS,
        exchange "NSI") equity results are kept so results map 1:1 to a
        single tradeable symbol."""
        try:
            response = requests.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={"q": query, "quotesCount": 10, "newsCount": 0},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=5,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"NSE symbol search failed: {e}")
            return []

        results = []
        for item in data.get("quotes", []):
            if item.get("exchange") != "NSI" or item.get("quoteType") != "EQUITY":
                continue
            symbol = item.get("symbol", "")
            if not symbol:
                continue
            results.append({
                "symbol": symbol,
                "displaySymbol": symbol.replace(".NS", ""),
                "description": item.get("longname") or item.get("shortname") or symbol,
                "exchange": "NSE",
                "country": "India",
            })
        return results[:10]

    def _search_mutual_fund_symbols(query):
        if not MFTOOL_AVAILABLE:
            try:
                from mftool import Mftool
                mf_instance = Mftool()
            except ImportError as e:
                print(f"[ERROR] mftool import failed: {e}")
                return []
        else:
            try:
                if mf is not None:
                    mf_instance = mf
                else:
                    from mftool import Mftool
                    mf_instance = Mftool()
            except Exception as e:
                print(f"[ERROR] Failed to get mftool instance: {e}")
                return []

        try:
            all_schemes = mf_instance.get_scheme_codes()
            if not all_schemes:
                return []

            results = []
            query_upper = query.upper()

            for scheme_code, scheme_name in all_schemes.items():
                if query_upper in scheme_name.upper() or query_upper in str(scheme_code):
                    results.append({
                        "symbol": str(scheme_code),
                        "displaySymbol": str(scheme_code),
                        "description": scheme_name,
                        "exchange": "AMFI",
                        "country": "India",
                    })
                    if len(results) >= 10:
                        break
            return results
        except Exception as e:
            print(f"[ERROR] Mutual fund symbol search failed: {e}")
            return []

    # ---------------- AI FEATURES (owner/editor only, graceful when unconfigured) ----------------

    def _portfolio_snapshot_for_caller(household_id, currency="USD"):
        holdings = scoped_holdings_query(household_id).all()
        holdings_by_id = {h.id: h for h in holdings}
        holdings_with_metrics = list_holdings_with_metrics(holdings, display_currency=currency)
        liabilities = scoped_liabilities_query(household_id).all()
        total_liabilities = total_liabilities_display(liabilities, display_currency=currency)
        dashboard = build_dashboard(
            holdings_with_metrics, holdings_by_id, display_currency=currency, total_liabilities=total_liabilities
        )
        return ai_service.build_portfolio_snapshot(holdings_with_metrics, dashboard, currency), dashboard

    @app.route("/api/ai/chat", methods=["POST"])
    @require_auth
    @limiter.limit("5 per minute")
    def ai_chat():
        if not ai_service.is_configured():
            return jsonify({"error": "AI features aren't configured yet", "code": "ai_not_configured"}), 503

        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        messages = data.get("messages")
        if not messages or not isinstance(messages, list):
            return jsonify({"error": "messages is required"}), 400
        messages = messages[-20:]  # cap history sent per request

        currency = data.get("currency", "USD")
        snapshot, _ = _portfolio_snapshot_for_caller(household_id, currency)

        def generate():
            try:
                for chunk in ai_service.chat_stream(messages, snapshot):
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.route("/api/ai/allocation-advisor", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def ai_allocation_advisor():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        target_allocation = data.get("target_allocation")
        if not isinstance(target_allocation, dict):
            return jsonify({"error": "target_allocation is required (asset_type -> percent)"}), 400
        try:
            validate_target_allocation(target_allocation)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        currency = data.get("currency", "USD")
        _, dashboard = _portfolio_snapshot_for_caller(household_id, currency)
        plan = compute_rebalance_plan(dashboard["allocation_by_type"], dashboard["total_assets"], target_allocation)

        narrative = None
        quota_exceeded = False
        if ai_service.is_configured():
            current_allocation = {a["label"]: a["value"] for a in dashboard["allocation_by_type"]}
            try:
                narrative = ai_service.generate_allocation_narrative(current_allocation, target_allocation, plan)
            except ai_service.QuotaExceededError:
                quota_exceeded = True

        return jsonify({
            "ai_configured": ai_service.is_configured(),
            "rebalance_plan": plan,
            "narrative": narrative,
            "quota_exceeded": quota_exceeded,
            "disclaimer": "This is informational only, generated from your own portfolio data, and is not financial advice.",
        })

    # A category more than this many percentage points off its saved target
    # counts as "drifted" for the on-page-load check below.
    ALLOCATION_DRIFT_THRESHOLD_PCT = 5.0

    @app.route("/allocation-targets", methods=["GET"])
    @require_auth
    def get_allocation_targets_route():
        return jsonify(get_target_allocation(g.user_id))

    @app.route("/allocation-targets", methods=["PUT"])
    @require_auth
    def save_allocation_targets_route():
        data = request.get_json(force=True) or {}
        target_allocation = data.get("target_allocation")
        if not isinstance(target_allocation, dict):
            return jsonify({"error": "target_allocation is required (asset_type -> percent)"}), 400
        try:
            validate_target_allocation(target_allocation)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        saved = save_target_allocation(g.user_id, target_allocation)
        return jsonify(saved), 201

    @app.route("/allocation-targets", methods=["DELETE"])
    @require_auth
    def clear_allocation_targets_route():
        clear_target_allocation(g.user_id)
        return jsonify({"message": "Target allocation cleared"}), 200

    @app.route("/allocation-drift", methods=["GET"])
    @require_auth
    def allocation_drift_route():
        """Fast, AI-free drift check against the caller's saved target
        allocation (if any) — no narrative, just the same rebalance math the
        AI advisor already computes, so this is cheap enough to run on
        every Dashboard/Allocation Advisor page load."""
        target_allocation = get_target_allocation(g.user_id)
        if not target_allocation:
            return jsonify({"has_target": False})

        currency = request.args.get("currency", "USD").upper()
        _, dashboard = _portfolio_snapshot_for_caller(None, currency)
        plan = compute_rebalance_plan(dashboard["allocation_by_type"], dashboard["total_assets"], target_allocation)
        max_drift_pct = max((abs(p["current_pct"] - p["target_pct"]) for p in plan), default=0.0)

        return jsonify({
            "has_target": True,
            "target_allocation": target_allocation,
            "plan": plan,
            "max_drift_pct": round(max_drift_pct, 2),
            "is_drifted": max_drift_pct > ALLOCATION_DRIFT_THRESHOLD_PCT,
        })

    @app.route("/transactions/<int:transaction_id>/suggest-tags", methods=["POST"])
    @require_auth
    @limiter.limit("20 per minute")
    def ai_suggest_transaction_tags(transaction_id):
        tx = get_authorized_transaction(transaction_id, require_write=True)
        holding = Holding.query.get(tx.holding_id)
        require_ai_access(str(holding.household_id) if holding.household_id else None)

        if not ai_service.is_configured():
            return jsonify({"configured": False, "suggestion": None})

        suggestion = ai_service.suggest_transaction_tags(
            holding.name, holding.asset_type, tx.transaction_type, tx.quantity, tx.price_per_unit, tx.currency
        )
        return jsonify({"configured": True, "suggestion": suggestion})

    @app.route("/api/ai/search", methods=["POST"])
    @require_auth
    @limiter.limit("20 per minute")
    def ai_search():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        query = (data.get("query") or "").strip()
        if not query:
            return jsonify({"error": "query is required"}), 400

        if not ai_service.is_configured():
            return jsonify({"configured": False, "filter_spec": None})

        try:
            filter_spec = ai_service.parse_search_query(query)
        except ai_service.QuotaExceededError as e:
            return jsonify({"error": str(e), "quota_exceeded": True}), 429
        return jsonify({"configured": True, "filter_spec": filter_spec})

    # ---------------- GOALS ----------------

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

    # ---------------- LIABILITIES ----------------

    @app.route("/liabilities", methods=["POST"])
    @require_auth
    def create_liability():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        if data.get("liability_type") not in LIABILITY_TYPES:
            return jsonify({"error": f"liability_type must be one of {LIABILITY_TYPES}"}), 400
        if not data.get("name") or not str(data["name"]).strip():
            return jsonify({"error": "name is required"}), 400

        liability = Liability(
            user_id=g.user_id,
            household_id=household_id,
            name=data["name"].strip(),
            liability_type=data["liability_type"],
            currency=data.get("currency", "USD"),
            current_balance=safe_float(data.get("current_balance")),
            original_amount=safe_float(data["original_amount"]) if data.get("original_amount") not in (None, "") else None,
            interest_rate=safe_float(data["interest_rate"]) if data.get("interest_rate") not in (None, "") else None,
            notes=data.get("notes"),
            is_private=bool(data.get("is_private", False)),
        )
        db.session.add(liability)
        db.session.commit()
        return jsonify(liability.to_dict()), 201

    @app.route("/liabilities", methods=["GET"])
    @require_auth
    def get_liabilities():
        household_id_param = request.args.get("household_id")
        display_currency = request.args.get("currency", "USD").upper()
        liabilities = scoped_liabilities_query(household_id_param).order_by(Liability.created_at.desc()).all()
        return jsonify(list_liabilities_with_display(liabilities, display_currency=display_currency))

    @app.route("/liabilities/<int:liability_id>", methods=["PUT"])
    @require_auth
    def update_liability(liability_id):
        liability = get_authorized_liability(liability_id, require_write=True)
        data = request.get_json(force=True)

        if "household_id" in data:
            validate_household_id_for_write(data["household_id"])
            liability.household_id = data["household_id"]
        if "liability_type" in data:
            if data["liability_type"] not in LIABILITY_TYPES:
                return jsonify({"error": f"liability_type must be one of {LIABILITY_TYPES}"}), 400
            liability.liability_type = data["liability_type"]
        if "name" in data:
            if not data["name"] or not str(data["name"]).strip():
                return jsonify({"error": "name is required"}), 400
            liability.name = data["name"].strip()
        for field in ("currency", "notes"):
            if field in data:
                setattr(liability, field, data[field])
        if "current_balance" in data:
            liability.current_balance = safe_float(data["current_balance"])
        if "original_amount" in data:
            liability.original_amount = safe_float(data["original_amount"]) if data["original_amount"] not in (None, "") else None
        if "interest_rate" in data:
            liability.interest_rate = safe_float(data["interest_rate"]) if data["interest_rate"] not in (None, "") else None
        if "is_private" in data:
            liability.is_private = bool(data["is_private"])

        db.session.commit()
        return jsonify(liability.to_dict())

    @app.route("/liabilities/<int:liability_id>", methods=["DELETE"])
    @require_auth
    def delete_liability(liability_id):
        liability = get_authorized_liability(liability_id, require_write=True)
        db.session.delete(liability)
        db.session.commit()
        return jsonify({"message": "Liability deleted"}), 200

    # ---------------- MILESTONES (auto-detected, from the daily snapshot job) ----------------

    @app.route("/milestones", methods=["GET"])
    @require_auth
    def get_milestones():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        return jsonify(list_milestones(
            user_id=g.user_id if not household_id_param else None, household_id=household_id_param
        ))

    @app.route("/milestones/<int:milestone_id>/acknowledge", methods=["PUT"])
    @require_auth
    def acknowledge_milestone_route(milestone_id):
        milestone = Milestone.query.get_or_404(milestone_id)
        if milestone.user_id is not None:
            if str(milestone.user_id) != str(g.user_id):
                abort(403)
        elif milestone.household_id is not None:
            if str(milestone.household_id) not in get_member_household_ids(g.user_id):
                abort(403)
        else:
            abort(403)
        milestone.acknowledged = True
        db.session.commit()
        return jsonify(milestone.to_dict())

    # ---------------- ACCOUNT DATA (Settings page: export / danger zone) ----------------

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

    @app.route("/account/data", methods=["DELETE"])
    @require_auth
    @limiter.limit("5 per hour")
    def account_delete_data():
        data = request.get_json(silent=True) or {}
        if data.get("confirm") != "DELETE":
            return jsonify({"error": "Type DELETE to confirm this action"}), 400
        result = delete_all_user_data(g.user_id)
        return jsonify(result)

    # ---------------- BUDGET (income / expenses — independent of net worth) ----------------

    def scoped_budget_query(household_id_param):
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403, description="Not a member of this household")
            return BudgetEntry.query.filter(
                BudgetEntry.household_id == household_id_param, BudgetEntry.is_private == False  # noqa: E712
            )
        return BudgetEntry.query.filter(BudgetEntry.user_id == g.user_id)

    def get_authorized_budget_entry(entry_id, require_write=False):
        entry = BudgetEntry.query.get_or_404(entry_id)
        if str(entry.user_id) == str(g.user_id):
            return entry
        if entry.household_id:
            role = get_role(str(entry.household_id), g.user_id)
            if role:
                if require_write and role in ("owner", "editor"):
                    return entry
                if not require_write and not entry.is_private:
                    return entry
        abort(403)

    @app.route("/budget/categories", methods=["GET"])
    @require_auth
    def budget_categories():
        return jsonify({"income": INCOME_CATEGORIES, "expense": EXPENSE_CATEGORIES})

    @app.route("/budget/entries", methods=["GET"])
    @require_auth
    def list_budget_entries():
        household_id_param = request.args.get("household_id")
        query = scoped_budget_query(household_id_param)

        entry_type = request.args.get("entry_type")
        if entry_type:
            query = query.filter(BudgetEntry.entry_type == entry_type)
        date_from = request.args.get("date_from")
        if date_from:
            query = query.filter(BudgetEntry.entry_date >= date.fromisoformat(date_from))
        date_to = request.args.get("date_to")
        if date_to:
            query = query.filter(BudgetEntry.entry_date <= date.fromisoformat(date_to))

        entries = query.order_by(BudgetEntry.entry_date.desc()).limit(500).all()
        return jsonify([e.to_dict() for e in entries])

    @app.route("/budget/entries", methods=["POST"])
    @require_auth
    def create_budget_entry():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        entry_type = data.get("entry_type")
        if entry_type not in ("income", "expense"):
            return jsonify({"error": "entry_type must be 'income' or 'expense'"}), 400
        category = data.get("category")
        valid_categories = INCOME_CATEGORIES if entry_type == "income" else EXPENSE_CATEGORIES
        if category not in valid_categories:
            return jsonify({"error": f"category must be one of {valid_categories}"}), 400

        recurring_frequency = data.get("recurring_frequency")
        if recurring_frequency and recurring_frequency not in ("weekly", "monthly", "quarterly", "yearly"):
            return jsonify({"error": "recurring_frequency must be weekly, monthly, quarterly, or yearly"}), 400

        entry = BudgetEntry(
            user_id=g.user_id,
            household_id=household_id,
            entry_type=entry_type,
            entry_date=date.fromisoformat(data["entry_date"]),
            amount=safe_float(data["amount"]),
            currency=data.get("currency", "USD"),
            category=category,
            description=data.get("description"),
            is_private=bool(data.get("is_private", False)),
            is_recurring=bool(data.get("is_recurring", False)),
            recurring_frequency=recurring_frequency,
        )
        db.session.add(entry)

        funding_valuation = None
        funding_source_id = data.get("funding_source_holding_id")
        if funding_source_id and entry_type == "expense":
            source_holding = get_authorized_holding(funding_source_id, require_write=True)
            source_valuations = HoldingValuation.query.filter_by(holding_id=source_holding.id).all()
            try:
                funding_valuation = build_funding_valuation(
                    source_holding, source_valuations, entry.amount, entry.currency, entry.entry_date, g.user_id
                )
            except ValueError as e:
                db.session.rollback()
                return jsonify({"error": str(e)}), 400
            db.session.add(funding_valuation)

        db.session.commit()
        return jsonify({**entry.to_dict(), "funding_source": funding_valuation.to_dict() if funding_valuation else None}), 201

    @app.route("/budget/entries/<int:entry_id>", methods=["PUT"])
    @require_auth
    def update_budget_entry(entry_id):
        entry = get_authorized_budget_entry(entry_id, require_write=True)
        data = request.get_json(force=True)

        if "entry_date" in data:
            entry.entry_date = date.fromisoformat(data["entry_date"])
        if "amount" in data:
            entry.amount = safe_float(data["amount"])
        if "currency" in data:
            entry.currency = data["currency"]
        if "category" in data:
            valid_categories = INCOME_CATEGORIES if entry.entry_type == "income" else EXPENSE_CATEGORIES
            if data["category"] not in valid_categories:
                return jsonify({"error": f"category must be one of {valid_categories}"}), 400
            entry.category = data["category"]
        if "description" in data:
            entry.description = data["description"]
        if "is_private" in data:
            entry.is_private = bool(data["is_private"])
        if "is_recurring" in data:
            entry.is_recurring = bool(data["is_recurring"])
        if "recurring_frequency" in data:
            if data["recurring_frequency"] and data["recurring_frequency"] not in ("weekly", "monthly", "quarterly", "yearly"):
                return jsonify({"error": "recurring_frequency must be weekly, monthly, quarterly, or yearly"}), 400
            entry.recurring_frequency = data["recurring_frequency"]

        db.session.commit()
        return jsonify(entry.to_dict())

    @app.route("/budget/entries/<int:entry_id>", methods=["DELETE"])
    @require_auth
    def delete_budget_entry(entry_id):
        entry = get_authorized_budget_entry(entry_id, require_write=True)
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"message": "Entry deleted"}), 200

    @app.route("/budget/summary", methods=["GET"])
    @require_auth
    def budget_summary():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        months = int(request.args.get("months", 6))
        currency = request.args.get("currency", "USD").upper()
        result = get_monthly_summary(
            g.user_id if not household_id_param else None, household_id_param, months=months, currency=currency
        )
        return jsonify(result)

    @app.route("/budget/subscriptions", methods=["GET"])
    @require_auth
    def budget_subscriptions():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        currency = request.args.get("currency", "USD").upper()
        result = get_subscriptions(
            g.user_id if not household_id_param else None, household_id_param, currency=currency
        )
        return jsonify(result)

    @app.route("/budget/limits", methods=["GET"])
    @require_auth
    def budget_limits_list():
        household_id_param = request.args.get("household_id")
        if household_id_param and household_id_param not in get_member_household_ids(g.user_id):
            abort(403)
        limits = get_limits(g.user_id if not household_id_param else None, household_id_param)
        return jsonify(limits)

    @app.route("/budget/limits", methods=["POST"])
    @require_auth
    def budget_limits_create():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)
        try:
            limit = set_limit(
                g.user_id,
                category=data.get("category"),
                monthly_limit=safe_float(data.get("monthly_limit")),
                currency=data.get("currency", "USD"),
                household_id=household_id,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify(limit), 201

    @app.route("/budget/limits/<int:limit_id>", methods=["DELETE"])
    @require_auth
    def budget_limits_delete(limit_id):
        limit = BudgetLimit.query.get_or_404(limit_id)
        if limit.household_id:
            validate_household_id_for_write(str(limit.household_id))
        elif str(limit.user_id) != str(g.user_id):
            abort(403)
        delete_limit(limit_id, g.user_id, str(limit.household_id) if limit.household_id else None)
        return jsonify({"message": "Limit deleted"}), 200

    @app.route("/api/ai/budget-insights", methods=["POST"])
    @require_auth
    @limiter.limit("10 per minute")
    def ai_budget_insights():
        data = request.get_json(force=True) or {}
        household_id = data.get("household_id")
        require_ai_access(household_id)

        if not ai_service.is_configured():
            return jsonify({"configured": False, "narrative": None})

        if household_id and household_id not in get_member_household_ids(g.user_id):
            abort(403)
        months = int(data.get("months", 6))
        currency = data.get("currency", "USD").upper()
        summary = get_monthly_summary(
            g.user_id if not household_id else None, household_id, months=months, currency=currency
        )
        try:
            narrative = ai_service.generate_budget_narrative(summary)
        except ai_service.QuotaExceededError as e:
            return jsonify({"error": str(e), "quota_exceeded": True}), 429
        return jsonify({"configured": True, "narrative": narrative})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5001)
