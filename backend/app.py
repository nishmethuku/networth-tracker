from datetime import date
import os
from flask import Flask, jsonify, request, g, abort
from flask_cors import CORS
from flask_migrate import Migrate
import requests

from .models import db, Asset
from .auth import require_auth
from .utils import get_current_stock_price, FINNHUB_API_KEY, NSELIB_AVAILABLE, MFTOOL_AVAILABLE
from .finance import calculate_cagr
from .services import calculate_asset_metrics, aggregate_cash_by_account, safe_float
from .household_service import (
    get_member_household_ids,
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

# Import mf instance if available
try:
    from .utils import mf, MFTOOL_AVAILABLE
except (ImportError, AttributeError):
    mf = None
    MFTOOL_AVAILABLE = False

SNAPSHOT_SECRET = os.environ.get("SNAPSHOT_SECRET")


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

    # ---------------- SCOPE HELPERS ----------------

    def scoped_asset_query(household_id_param):
        """Base query for the caller's accessible assets.
        No household_id param -> the caller's own (possibly shared) assets.
        household_id param -> that household's shared pool, if the caller is a member.
        """
        if household_id_param:
            member_ids = get_member_household_ids(g.user_id)
            if household_id_param not in member_ids:
                abort(403, description="Not a member of this household")
            return Asset.query.filter(Asset.household_id == household_id_param)
        return Asset.query.filter(Asset.user_id == g.user_id)

    def get_authorized_asset(asset_id):
        """Fetch an asset the caller may read/write: owner, or a member of the
        household it's shared into (full co-edit)."""
        asset = Asset.query.get_or_404(asset_id)
        member_ids = set(get_member_household_ids(g.user_id))
        is_owner = str(asset.user_id) == str(g.user_id)
        is_household_member = asset.household_id is not None and str(asset.household_id) in member_ids
        if not is_owner and not is_household_member:
            abort(403)
        return asset

    def validate_household_id_for_write(household_id):
        if not household_id:
            return
        member_ids = get_member_household_ids(g.user_id)
        if household_id not in member_ids:
            abort(403, description="Not a member of this household")

    # ---------------- CREATE ASSET ----------------

    @app.route("/assets", methods=["POST"])
    @require_auth
    def create_asset():
        data = request.get_json(force=True)
        household_id = data.get("household_id")
        validate_household_id_for_write(household_id)

        asset = Asset(
            user_id=g.user_id,
            household_id=household_id,
            asset_type=data["asset_type"],
            country=data["country"],
            account=data["account"],
            purchase_date=date.fromisoformat(data["purchase_date"]),
            symbol=data.get("symbol"),
            units=data.get("units"),
            buy_price=data.get("buy_price"),
            name=data.get("name"),
            buy_value=data.get("buy_value"),
            current_value=data.get("current_value"),
            institution=data.get("institution"),
            value=data.get("value"),
            notes=data.get("notes"),
            tags=data.get("tags"),
        )

        db.session.add(asset)
        db.session.commit()
        return jsonify(asset.to_dict()), 201

    # ---------------- GET ASSETS ----------------

    @app.route("/assets", methods=["GET"])
    @require_auth
    def get_assets():
        """
        Assets visible to the caller, with computed metrics for each holding.
        - household_id: view a shared household's assets instead of the caller's own
        - asset_type / country / account / tag: filters, same as before

        Special handling for cash assets: when asset_type=cash, returns grouped
        cash accounts instead of individual entries.
        """
        household_id_param = request.args.get("household_id")
        query = scoped_asset_query(household_id_param)

        asset_type = request.args.get("asset_type")
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)

        country = request.args.get("country")
        if country:
            query = query.filter(Asset.country == country)

        account = request.args.get("account")
        if account:
            query = query.filter(Asset.account == account)

        tag_search = request.args.get("tag")
        if tag_search:
            query = query.filter(Asset.tags.like(f"%{tag_search}%"))

        assets = query.order_by(Asset.purchase_date.desc(), Asset.updated_at.desc()).all()

        if asset_type == "cash":
            cash_assets = [a for a in assets if a.asset_type == "cash"]
            grouped_accounts = aggregate_cash_by_account(cash_assets)
            if country:
                grouped_accounts = [acc for acc in grouped_accounts if acc["country"] == country]
            if account:
                grouped_accounts = [acc for acc in grouped_accounts if acc["account"] == account]
            grouped_accounts.sort(key=lambda x: x.get("purchase_date", ""), reverse=True)
            return jsonify(grouped_accounts)

        results = []
        for a in assets:
            fetch_live = a.asset_type in ("stock", "mutual_fund")
            metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
            results.append({**a.to_dict(), **metrics})

        results.sort(
            key=lambda x: (x.get("purchase_date", ""), x.get("created_at", "")),
            reverse=True,
        )
        return jsonify(results)

    # ---------------- UPDATE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["PUT"])
    @require_auth
    def update_asset(asset_id):
        asset = get_authorized_asset(asset_id)
        data = request.get_json(force=True)

        if "household_id" in data:
            validate_household_id_for_write(data["household_id"])
            asset.household_id = data["household_id"]
        if "asset_type" in data:
            asset.asset_type = data["asset_type"]
        if "country" in data:
            asset.country = data["country"]
        if "account" in data:
            asset.account = data["account"]
        if "purchase_date" in data:
            asset.purchase_date = date.fromisoformat(data["purchase_date"])
        if "symbol" in data:
            asset.symbol = data.get("symbol")
        if "units" in data:
            asset.units = data.get("units")
        if "buy_price" in data:
            asset.buy_price = data.get("buy_price")
        if "name" in data:
            asset.name = data.get("name")
        if "buy_value" in data:
            asset.buy_value = data.get("buy_value")
        if "current_value" in data:
            asset.current_value = data.get("current_value")
        if "institution" in data:
            asset.institution = data.get("institution")
        if "value" in data:
            asset.value = data.get("value")
        if "notes" in data:
            asset.notes = data.get("notes")
        if "tags" in data:
            asset.tags = data.get("tags")

        db.session.commit()

        fetch_live = asset.asset_type in ("stock", "mutual_fund")
        metrics = calculate_asset_metrics(asset, fetch_live_price=fetch_live)
        return jsonify({**asset.to_dict(), **metrics})

    # ---------------- DELETE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["DELETE"])
    @require_auth
    def delete_asset(asset_id):
        asset = get_authorized_asset(asset_id)
        db.session.delete(asset)
        db.session.commit()
        return jsonify({"message": "Asset deleted successfully"}), 200

    # ---------------- GET SINGLE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["GET"])
    @require_auth
    def get_asset(asset_id):
        asset = get_authorized_asset(asset_id)
        fetch_live = asset.asset_type in ("stock", "mutual_fund")
        metrics = calculate_asset_metrics(asset, fetch_live_price=fetch_live)
        return jsonify({**asset.to_dict(), **metrics})

    # ---------------- STOCKS ENDPOINT (derived from assets) ----------------

    @app.route("/stocks", methods=["GET"])
    @require_auth
    def get_stocks():
        """Stocks/mutual funds visible to the caller (own, or a shared household's)."""
        household_id_param = request.args.get("household_id")
        assets = scoped_asset_query(household_id_param).filter(
            Asset.asset_type.in_(["stock", "mutual_fund"])
        ).all()
        results = []

        for a in assets:
            metrics = calculate_asset_metrics(a, fetch_live_price=True)

            current_price = None
            if a.symbol and a.units:
                units = float(a.units) if a.units else 1.0
                if units > 0 and metrics["current_value"] > 0:
                    current_price = metrics["current_value"] / units
                else:
                    price = get_current_stock_price(a.symbol)
                    current_price = float(price) if price else None

            results.append(
                {
                    "id": a.id,
                    "symbol": a.symbol,
                    "ticker": a.symbol,
                    "asset_type": a.asset_type,
                    "units": float(a.units) if a.units else 0.0,
                    "shares": float(a.units) if a.units else 0.0,
                    "buy_price": float(a.buy_price) if a.buy_price else 0.0,
                    "current_price": current_price,
                    "buy_value": metrics["buy_value"],
                    "current_value": metrics["current_value"],
                    "market_value": metrics["current_value"],
                    "profit": metrics["profit"],
                    "profit_loss": metrics["profit"],
                    "profit_pct": metrics["profit_pct"],
                    "cagr": metrics["cagr"],
                    "country": a.country,
                    "account": a.account,
                    "purchase_date": a.purchase_date.isoformat(),
                    "created_at": a.created_at.isoformat(),
                }
            )

        return jsonify(results)

    # ---------------- DASHBOARD SUMMARY ----------------

    @app.route("/summary", methods=["GET"])
    @require_auth
    def get_summary():
        """
        High-level dashboard summary and hierarchical aggregates for the caller's
        accessible assets (own, or a shared household's via ?household_id=).
        """
        household_id_param = request.args.get("household_id")
        query = scoped_asset_query(household_id_param)

        asset_type = request.args.get("asset_type")
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)

        country = request.args.get("country")
        if country:
            query = query.filter(Asset.country == country)

        assets = query.all()

        total_net_worth = 0.0
        total_stock_value = 0.0
        total_property_value = 0.0
        total_profit_loss = 0.0

        grand_totals = {
            "buy_value": 0.0,
            "current_value": 0.0,
            "profit": 0.0,
            "profit_pct": 0.0,
            "cagr": 0.0,
        }

        countries = {}

        for a in assets:
            fetch_live = a.asset_type in ("stock", "mutual_fund")
            metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
            buy_value = metrics["buy_value"]
            current_value = metrics["current_value"]
            profit = metrics["profit"]

            total_net_worth += current_value
            total_profit_loss += profit
            grand_totals["buy_value"] += buy_value
            grand_totals["current_value"] += current_value
            grand_totals["profit"] += profit

            if a.asset_type in ("stock", "mutual_fund"):
                total_stock_value += current_value
            if a.asset_type in ("real_estate", "metal"):
                total_property_value += current_value

            country_name = a.country
            account_name = a.account

            country_entry = countries.setdefault(
                country_name,
                {
                    "country": country_name,
                    "totals": {
                        "buy_value": 0.0,
                        "current_value": 0.0,
                        "profit": 0.0,
                        "profit_pct": 0.0,
                        "cagr": 0.0,
                    },
                    "accounts": {},
                },
            )

            account_entry = country_entry["accounts"].setdefault(
                account_name,
                {
                    "account": account_name,
                    "totals": {
                        "buy_value": 0.0,
                        "current_value": 0.0,
                        "profit": 0.0,
                        "profit_pct": 0.0,
                        "cagr": 0.0,
                    },
                    "per_stock": {},
                },
            )

            for target in (country_entry["totals"], account_entry["totals"]):
                target["buy_value"] += buy_value
                target["current_value"] += current_value
                target["profit"] += profit

            if a.asset_type in ("stock", "mutual_fund"):
                purchase_date = a.purchase_date or date.today()
                symbol = a.symbol or f"asset_{a.id}"
                stock_bucket = account_entry["per_stock"].setdefault(
                    symbol,
                    {
                        "symbol": a.symbol,
                        "asset_type": a.asset_type,
                        "country": country_name,
                        "account": account_name,
                        "units": 0.0,
                        "buy_value": 0.0,
                        "current_value": 0.0,
                        "profit": 0.0,
                        "profit_pct": 0.0,
                        "cagr": 0.0,
                        "earliest_purchase_date": purchase_date,
                        "buy_price": 0.0,
                        "current_price": 0.0,
                    },
                )

                stock_bucket["units"] += float(a.units or 0.0)
                stock_bucket["buy_value"] += buy_value
                stock_bucket["current_value"] += current_value
                stock_bucket["profit"] += profit

                if purchase_date < stock_bucket["earliest_purchase_date"]:
                    stock_bucket["earliest_purchase_date"] = purchase_date

        def finalize_totals(t):
            if t["buy_value"]:
                t["profit_pct"] = (t["profit"] / t["buy_value"]) * 100.0
                earliest_date = min(
                    (a.purchase_date for a in assets if a.purchase_date),
                    default=date.today(),
                )
                t["cagr"] = calculate_cagr(
                    abs(t["buy_value"]), abs(t["current_value"]), earliest_date
                )

        finalize_totals(grand_totals)

        for country_entry in countries.values():
            finalize_totals(country_entry["totals"])

            for account_entry in country_entry["accounts"].values():
                finalize_totals(account_entry["totals"])

                for stock_bucket in account_entry["per_stock"].values():
                    units = stock_bucket["units"] or 0.0
                    if units:
                        stock_bucket["buy_price"] = stock_bucket["buy_value"] / units
                        stock_bucket["current_price"] = stock_bucket["current_value"] / units

                    if stock_bucket["buy_value"]:
                        stock_bucket["profit_pct"] = (
                            stock_bucket["profit"] / stock_bucket["buy_value"]
                        ) * 100.0
                        stock_bucket["cagr"] = calculate_cagr(
                            abs(stock_bucket["buy_value"]),
                            abs(stock_bucket["current_value"]),
                            stock_bucket["earliest_purchase_date"],
                        )

                account_entry["per_stock"] = list(account_entry["per_stock"].values())

            country_entry["accounts"] = list(country_entry["accounts"].values())

        countries_list = list(countries.values())

        return jsonify(
            {
                "total_net_worth": total_net_worth,
                "total_stock_value": total_stock_value,
                "total_property_value": total_property_value,
                "total_profit_loss": total_profit_loss,
                "grand_totals": grand_totals,
                "countries": countries_list,
            }
        )

    # ---------------- ANALYTICS (TIME SERIES & HISTOGRAMS) ----------------

    @app.route("/analytics", methods=["GET"])
    @require_auth
    def get_analytics():
        """
        Returns net worth/assets over time, allocation pie, and CAGR histogram
        for the caller's accessible assets (own, or a shared household's).

        NOTE: net_worth_over_time here is still the backward-projection estimate
        (today's valuations applied back to each asset's purchase date), not the
        real daily net_worth_snapshots history. The frontend prefers real
        snapshot data when enough of it exists and falls back to this.
        """
        household_id_param = request.args.get("household_id")
        assets = scoped_asset_query(household_id_param).order_by(Asset.purchase_date.asc()).all()

        per_asset = []
        for a in assets:
            fetch_live = a.asset_type in ("stock", "mutual_fund")
            metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
            purchase_date = a.purchase_date or date.today()
            per_asset.append(
                {
                    "asset": a,
                    "buy_value": metrics["buy_value"],
                    "current_value": metrics["current_value"],
                    "profit": metrics["profit"],
                    "cagr": metrics["cagr"],
                    "purchase_date": purchase_date,
                }
            )

        unique_dates = sorted(
            {item["purchase_date"] for item in per_asset if item["purchase_date"]}
        )
        net_worth_over_time = []

        for d in unique_dates:
            net_worth = 0.0
            assets_value = 0.0
            for item in per_asset:
                if item["purchase_date"] <= d:
                    net_worth += item["current_value"]
                    assets_value += item["buy_value"]
            net_worth_over_time.append(
                {"date": d.isoformat(), "net_worth": net_worth, "assets_value": assets_value}
            )

        allocation_map = {}
        for item in per_asset:
            asset_type = item["asset"].asset_type
            allocation_map.setdefault(asset_type, 0.0)
            allocation_map[asset_type] += item["current_value"]

        allocation = [
            {"label": asset_type, "value": value} for asset_type, value in allocation_map.items()
        ]

        cagr_histogram = []
        for item in per_asset:
            a = item["asset"]
            label = a.symbol or a.name or a.institution or f"Asset #{a.id}"
            cagr_histogram.append(
                {
                    "label": label,
                    "asset_type": a.asset_type,
                    "country": a.country,
                    "account": a.account,
                    "cagr": item["cagr"],
                }
            )

        return jsonify(
            {
                "net_worth_over_time": net_worth_over_time,
                "allocation": allocation,
                "cagr_histogram": cagr_histogram,
            }
        )

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
        return jsonify([h.to_dict() for h in households])

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
        if household_id not in get_member_household_ids(g.user_id):
            abort(403)
        data = request.get_json(force=True)
        email = (data.get("email") or "").strip()
        if not email:
            return jsonify({"error": "email is required"}), 400
        invite = create_invite(household_id, g.user_id, email)
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

    # ---------------- INTERNAL: DAILY SNAPSHOT TRIGGER ----------------

    @app.route("/internal/snapshot", methods=["POST"])
    def trigger_snapshot():
        """Called once a day by a GitHub Actions cron workflow, authenticated
        with a shared secret (not a user session)."""
        provided = request.headers.get("X-Snapshot-Secret")
        if not SNAPSHOT_SECRET or provided != SNAPSHOT_SECRET:
            return jsonify({"error": "Unauthorized"}), 401
        result = snapshot_all_users()
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
