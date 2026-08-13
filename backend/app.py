from datetime import date
import os
from flask import Flask, jsonify, request, g, abort
from flask_cors import CORS
from flask_migrate import Migrate
import requests

from .models import db, Holding, HoldingTransaction, HoldingValuation, PriceHistory, PriceAlert, Milestone
from .auth import require_auth
from .utils import FINNHUB_API_KEY, MFTOOL_AVAILABLE
from .services import safe_float
from . import price_service
from .holdings_service import list_holdings_with_metrics, build_dashboard
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
)
from .snapshot_service import snapshot_all_users
from .digest_service import build_weekly_digest
from .alert_service import check_all_alerts
from .benchmark_service import get_benchmark_comparison
from .tax_service import get_tax_summary
from .csv_import_service import parse_csv, confirm_import, SUPPORTED_BROKERS

# Import mf instance if available
try:
    from .utils import mf, MFTOOL_AVAILABLE
except (ImportError, AttributeError):
    mf = None
    MFTOOL_AVAILABLE = False

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")
DIGEST_SECRET = os.environ.get("DIGEST_SECRET") or SNAPSHOT_SECRET


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

    db.init_app(app)
    Migrate(app, db)

    if os.environ.get("FLASK_ENV") == "production":
        CORS(app, origins=[os.environ.get("FRONTEND_URL", "*")])
    else:
        CORS(app)

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

    def validate_household_id_for_write(household_id):
        if not household_id:
            return
        if not can_edit_household(household_id, g.user_id):
            abort(403, description="You need editor access to this household")

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
        return jsonify(list_holdings_with_metrics(holdings, display_currency=display_currency))

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
        db.session.commit()
        return jsonify(tx.to_dict()), 201

    @app.route("/transactions/<int:transaction_id>", methods=["PUT"])
    @require_auth
    def update_transaction(transaction_id):
        tx = get_authorized_transaction(transaction_id, require_write=True)
        data = request.get_json(force=True)
        if "transaction_type" in data:
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
        return jsonify(build_dashboard(holdings_with_metrics, holdings_by_id, display_currency=display_currency))

    # ---------------- EXCHANGE RATES ----------------

    @app.route("/exchange-rates", methods=["GET"])
    @require_auth
    def get_exchange_rates():
        base = request.args.get("base", "USD").upper()
        targets = ["USD", "INR", "AUD"]
        rates = {t: (1.0 if t == base else price_service.get_rate(base, t)) for t in targets}
        return jsonify({"base": base, "rates": rates})

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
        result = get_tax_summary(
            g.user_id if not household_id_param else None, household_id_param
        )
        return jsonify(result)

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

    # ---------------- MILESTONES ----------------

    @app.route("/milestones", methods=["GET"])
    @require_auth
    def list_milestones():
        household_id_param = request.args.get("household_id")
        if household_id_param:
            if household_id_param not in get_member_household_ids(g.user_id):
                abort(403)
            milestones = Milestone.query.filter_by(household_id=household_id_param)
        else:
            milestones = Milestone.query.filter_by(user_id=g.user_id)
        milestones = milestones.order_by(Milestone.achieved_date.desc()).all()
        return jsonify([m.to_dict() for m in milestones])

    @app.route("/milestones/<int:milestone_id>/acknowledge", methods=["POST"])
    @require_auth
    def acknowledge_milestone(milestone_id):
        milestone = Milestone.query.get_or_404(milestone_id)
        owns_it = str(milestone.user_id) == str(g.user_id) if milestone.user_id else str(milestone.household_id) in get_member_household_ids(g.user_id)
        if not owns_it:
            abort(403)
        milestone.acknowledged = True
        db.session.commit()
        return jsonify(milestone.to_dict())

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

    # ---------------- NET WORTH HISTORY (real daily snapshots) ----------------

    @app.route("/net-worth-history", methods=["GET"])
    @require_auth
    def get_net_worth_history():
        """Real daily snapshots for the caller (or a shared household via
        ?household_id=). Empty until the daily snapshot job has run a few times."""
        from .models import NetWorthSnapshot

        household_id_param = request.args.get("household_id")
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403)
            rows = NetWorthSnapshot.query.filter_by(household_id=household_id_param)
        else:
            rows = NetWorthSnapshot.query.filter_by(user_id=g.user_id)

        rows = rows.order_by(NetWorthSnapshot.snapshot_date.asc()).all()
        return jsonify([r.to_dict() for r in rows])

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

    # ---------------- INTERNAL: DAILY SNAPSHOT / WEEKLY DIGEST TRIGGERS ----------------

    @app.route("/internal/snapshot", methods=["POST"])
    def trigger_snapshot():
        """Called once a day by a GitHub Actions cron workflow, authenticated
        with a shared secret (not a user session)."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or provided != SNAPSHOT_SECRET:
            return jsonify({"error": "Unauthorized"}), 401
        result = snapshot_all_users()
        return jsonify(result), 200

    @app.route("/internal/weekly-digest", methods=["POST"])
    def trigger_weekly_digest():
        """Called weekly by a GitHub Actions cron workflow. Computes a real
        digest per user/household and emails each recipient via Resend
        (email_service.send) — falls back to logging if RESEND_API_KEY isn't
        set, so this is safe to run either way."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not DIGEST_SECRET or provided != DIGEST_SECRET:
            return jsonify({"error": "Unauthorized"}), 401
        digests = build_weekly_digest()
        return jsonify({"digests_built": len(digests)}), 200

    @app.route("/internal/check-alerts", methods=["POST"])
    def trigger_check_alerts():
        """Called every few hours by a GitHub Actions cron workflow."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or provided != SNAPSHOT_SECRET:
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
        results = []
        common_nse_symbols = [
            {"symbol": "RELIANCE", "name": "Reliance Industries Ltd"},
            {"symbol": "TCS", "name": "Tata Consultancy Services Ltd"},
            {"symbol": "HDFCBANK", "name": "HDFC Bank Ltd"},
            {"symbol": "INFY", "name": "Infosys Ltd"},
            {"symbol": "HINDUNILVR", "name": "Hindustan Unilever Ltd"},
            {"symbol": "ICICIBANK", "name": "ICICI Bank Ltd"},
            {"symbol": "SBIN", "name": "State Bank of India"},
            {"symbol": "BHARTIARTL", "name": "Bharti Airtel Ltd"},
            {"symbol": "BAJFINANCE", "name": "Bajaj Finance Ltd"},
            {"symbol": "KOTAKBANK", "name": "Kotak Mahindra Bank Ltd"},
            {"symbol": "LT", "name": "Larsen & Toubro Ltd"},
            {"symbol": "HCLTECH", "name": "HCL Technologies Ltd"},
            {"symbol": "AXISBANK", "name": "Axis Bank Ltd"},
            {"symbol": "ASIANPAINT", "name": "Asian Paints Ltd"},
            {"symbol": "MARUTI", "name": "Maruti Suzuki India Ltd"},
            {"symbol": "TITAN", "name": "Titan Company Ltd"},
            {"symbol": "ULTRACEMCO", "name": "UltraTech Cement Ltd"},
            {"symbol": "NESTLEIND", "name": "Nestle India Ltd"},
            {"symbol": "TATAMOTORS", "name": "Tata Motors Ltd"},
            {"symbol": "WIPRO", "name": "Wipro Ltd"},
            {"symbol": "ITC", "name": "ITC Ltd"},
            {"symbol": "ONGC", "name": "Oil & Natural Gas Corp Ltd"},
            {"symbol": "NTPC", "name": "NTPC Ltd"},
            {"symbol": "POWERGRID", "name": "Power Grid Corp of India Ltd"},
            {"symbol": "SUNPHARMA", "name": "Sun Pharmaceutical Industries Ltd"},
        ]

        query_upper = query.upper()
        matching = []
        for item in common_nse_symbols:
            if query_upper in item["symbol"].upper() or query_upper in item["name"].upper():
                matching.append(item)
                if len(matching) >= 10:
                    break

        for item in matching:
            results.append({
                "symbol": f"{item['symbol']}.NS",
                "displaySymbol": item["symbol"],
                "description": item["name"],
                "exchange": "NSE",
                "country": "India",
            })
        return results

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
            all_schemes = mf_instance.get_all_scheme_codes()
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

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5001)
