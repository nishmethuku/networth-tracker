from datetime import date
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from .models import db, Asset
from .utils import get_current_stock_price, FINNHUB_API_KEY, NSELIB_AVAILABLE, MFTOOL_AVAILABLE
from .finance import calculate_cagr
from .services import calculate_asset_metrics, aggregate_cash_by_account, safe_float
import requests

# Import mf instance if available
try:
    from .utils import mf, MFTOOL_AVAILABLE
    print(f"[app.py] MFTOOL_AVAILABLE: {MFTOOL_AVAILABLE}")
    print(f"[app.py] Imported mf from utils: {mf is not None}, type: {type(mf)}")
except (ImportError, AttributeError) as e:
    print(f"[app.py] Could not import mf from utils: {e}")
    import traceback
    traceback.print_exc()
    mf = None
    MFTOOL_AVAILABLE = False


def create_app():
    app = Flask(__name__, static_folder=None)  # We'll handle static files manually

    db_path = os.path.join(os.path.dirname(__file__), "data.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    
    # CORS configuration
    if os.environ.get("FLASK_ENV") == "production":
        # In production, only allow specific origins
        CORS(app, origins=[os.environ.get("FRONTEND_URL", "*")])
    else:
        # In development, allow all origins
        CORS(app)
    
    # Serve static files in production (frontend build)
    static_folder = os.path.join(os.path.dirname(__file__), "static")
    if os.path.exists(static_folder):
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_frontend(path):
            if path != "" and os.path.exists(os.path.join(static_folder, path)):
                return send_from_directory(static_folder, path)
            else:
                return send_from_directory(static_folder, "index.html")

    with app.app_context():
        db.create_all()

    # ---------------- CREATE ASSET ----------------

    @app.route("/assets", methods=["POST"])
    def create_asset():
        data = request.get_json(force=True)

        asset = Asset(
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
            tags=data.get("tags"),  # Comma-separated string
        )

        db.session.add(asset)
        db.session.commit()
        return jsonify(asset.to_dict()), 201

    # ---------------- GET ASSETS ----------------

    @app.route("/assets", methods=["GET"])
    def get_assets():
        """
        Raw list of assets with computed metrics for each holding.
        Supports filtering by query parameters:
        - asset_type: Filter by asset type (stock, mutual_fund, etc.)
        - country: Filter by country
        - account: Filter by account name
        
        Special handling for cash assets:
        - When asset_type=cash, returns grouped cash accounts instead of individual entries
        - Each grouped account shows current balance and transaction history
        """
        query = Asset.query
        
        # Apply filters from query parameters
        asset_type = request.args.get("asset_type")
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)
        
        country = request.args.get("country")
        if country:
            query = query.filter(Asset.country == country)
        
        account = request.args.get("account")
        if account:
            query = query.filter(Asset.account == account)
        
        # Filter by tags (search for tags containing the search term)
        tag_search = request.args.get("tag")
        if tag_search:
            # Search in comma-separated tags using LIKE for SQLite compatibility
            query = query.filter(Asset.tags.like(f"%{tag_search}%"))
        
        # Sort by purchase_date descending (newest first), then by updated_at descending
        assets = query.order_by(Asset.purchase_date.desc(), Asset.updated_at.desc()).all()
        
        # Special handling for cash assets: group by account
        if asset_type == "cash":
            # Get all cash assets (already filtered by query above)
            cash_assets = [a for a in assets if a.asset_type == "cash"]
            
            # Apply additional filters to the grouped results
            grouped_accounts = aggregate_cash_by_account(cash_assets)
            
            # Apply country filter if specified (already in query, but double-check)
            if country:
                grouped_accounts = [acc for acc in grouped_accounts if acc["country"] == country]
            
            # Apply account filter if specified
            if account:
                grouped_accounts = [acc for acc in grouped_accounts if acc["account"] == account]
            
            # Sort grouped accounts by purchase_date (last updated) descending (newest first)
            grouped_accounts.sort(key=lambda x: x.get("purchase_date", ""), reverse=True)
            
            return jsonify(grouped_accounts)
        
        # For non-cash assets, return individual assets as before
        results = []
        for a in assets:
            # Fetch live prices for stocks and mutual funds
            fetch_live = a.asset_type in ("stock", "mutual_fund")
            metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
            results.append(
                {
                    **a.to_dict(),
                    **metrics,
                }
            )

        # Results are already sorted by query.order_by, but ensure consistency
        # Sort by purchase_date descending, then updated_at descending
        results.sort(
            key=lambda x: (
                x.get("purchase_date", ""),
                x.get("created_at", "")
            ),
            reverse=True
        )

        return jsonify(results)

    # ---------------- UPDATE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["PUT"])
    def update_asset(asset_id):
        asset = Asset.query.get_or_404(asset_id)
        data = request.get_json(force=True)

        # Update fields
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

        # Return updated asset with computed metrics
        # Fetch live prices for stocks and mutual funds
        fetch_live = asset.asset_type in ("stock", "mutual_fund")
        metrics = calculate_asset_metrics(asset, fetch_live_price=fetch_live)
        result = {
            **asset.to_dict(),
            **metrics,
        }
        return jsonify(result)

    # ---------------- DELETE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["DELETE"])
    def delete_asset(asset_id):
        asset = Asset.query.get_or_404(asset_id)
        db.session.delete(asset)
        db.session.commit()
        return jsonify({"message": "Asset deleted successfully"}), 200

    # ---------------- GET SINGLE ASSET ----------------

    @app.route("/assets/<int:asset_id>", methods=["GET"])
    def get_asset(asset_id):
        asset = Asset.query.get_or_404(asset_id)
        # Fetch live prices for stocks and mutual funds
        fetch_live = asset.asset_type in ("stock", "mutual_fund")
        metrics = calculate_asset_metrics(asset, fetch_live_price=fetch_live)
        result = {
            **asset.to_dict(),
            **metrics,
        }
        return jsonify(result)

    # ---------------- STOCKS ENDPOINT (derived from assets) ----------------

    @app.route("/stocks", methods=["GET"])
    def get_stocks():
        """
        Returns stocks (assets with asset_type='stock' or 'mutual_fund').
        This endpoint exists to maintain compatibility with the frontend.
        """
        assets = Asset.query.filter(
            Asset.asset_type.in_(["stock", "mutual_fund"])
        ).all()
        results = []

        for a in assets:
            # Fetch live prices for stocks endpoint
            metrics = calculate_asset_metrics(a, fetch_live_price=True)
            
            # Get current price for stocks (calculate from current_value in metrics)
            current_price = None
            if a.symbol and a.units:
                units = float(a.units) if a.units else 1.0
                if units > 0 and metrics["current_value"] > 0:
                    current_price = metrics["current_value"] / units
                else:
                    # Fallback: fetch directly if calculation fails
                    price = get_current_stock_price(a.symbol)
                    current_price = float(price) if price else None

            results.append(
                {
                    "id": a.id,
                    "symbol": a.symbol,
                    "ticker": a.symbol,  # Alias for compatibility
                    "asset_type": a.asset_type,
                    "units": float(a.units) if a.units else 0.0,
                    "shares": float(a.units) if a.units else 0.0,  # Alias
                    "buy_price": float(a.buy_price) if a.buy_price else 0.0,
                    "current_price": current_price,
                    "buy_value": metrics["buy_value"],
                    "current_value": metrics["current_value"],
                    "market_value": metrics["current_value"],  # Alias
                    "profit": metrics["profit"],
                    "profit_loss": metrics["profit"],  # Alias
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
    def get_summary():
        """
        High-level dashboard summary and hierarchical aggregates:
        - Net worth and P/L
        - Per-country, per-account, and per-stock aggregates

        This powers:
        - Dashboard cards (net worth, stocks, assets, total P/L)
        - Detailed drill-downs by country/account/symbol
        """
        query = Asset.query

        # Optional filtering by asset_type for dashboard filter bar
        asset_type = request.args.get("asset_type")
        if asset_type:
            query = query.filter(Asset.asset_type == asset_type)

        # Optional filtering by country (used for dashboard currency toggle)
        country = request.args.get("country")
        if country:
            query = query.filter(Asset.country == country)

        assets = query.all()

        total_net_worth = 0.0
        total_stock_value = 0.0
        total_property_value = 0.0
        total_profit_loss = 0.0

        # grand aggregate (all assets)
        grand_totals = {
            "buy_value": 0.0,
            "current_value": 0.0,
            "profit": 0.0,
            "profit_pct": 0.0,
            "cagr": 0.0,
        }

        # country -> account -> details
        countries = {}

        for a in assets:
            # ----- core metrics for this asset -----
            # Fetch live prices for stocks and mutual funds
            fetch_live = a.asset_type in ("stock", "mutual_fund")
            metrics = calculate_asset_metrics(a, fetch_live_price=fetch_live)
            buy_value = metrics["buy_value"]
            current_value = metrics["current_value"]
            profit = metrics["profit"]

            # ----- global aggregates -----
            total_net_worth += current_value
            total_profit_loss += profit
            grand_totals["buy_value"] += buy_value
            grand_totals["current_value"] += current_value
            grand_totals["profit"] += profit

            if a.asset_type in ("stock", "mutual_fund"):
                total_stock_value += current_value
            if a.asset_type in ("real_estate", "metal"):
                total_property_value += current_value

            # ----- country & account aggregates -----
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
                    # symbol -> aggregate
                    "per_stock": {},
                },
            )

            # update totals for country & account
            for target in (country_entry["totals"], account_entry["totals"]):
                target["buy_value"] += buy_value
                target["current_value"] += current_value
                target["profit"] += profit

            # per-stock aggregates only for market assets
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

        # ----- finalize percentage & CAGR metrics -----
        def finalize_totals(t):
            if t["buy_value"]:
                t["profit_pct"] = (t["profit"] / t["buy_value"]) * 100.0
                earliest_date = min(
                    (a.purchase_date for a in assets if a.purchase_date),
                    default=date.today(),
                )
                t["cagr"] = calculate_cagr(
                    abs(t["buy_value"]),
                    abs(t["current_value"]),
                    earliest_date,
                )

        finalize_totals(grand_totals)

        for country_entry in countries.values():
            finalize_totals(country_entry["totals"])

            for account_entry in country_entry["accounts"].values():
                finalize_totals(account_entry["totals"])

                # finalize per-stock aggregates
                for stock_bucket in account_entry["per_stock"].values():
                    units = stock_bucket["units"] or 0.0
                    if units:
                        stock_bucket["buy_price"] = stock_bucket["buy_value"] / units
                        stock_bucket["current_price"] = (
                            stock_bucket["current_value"] / units
                        )

                    if stock_bucket["buy_value"]:
                        stock_bucket["profit_pct"] = (
                            stock_bucket["profit"] / stock_bucket["buy_value"]
                        ) * 100.0
                        stock_bucket["cagr"] = calculate_cagr(
                            abs(stock_bucket["buy_value"]),
                            abs(stock_bucket["current_value"]),
                            stock_bucket["earliest_purchase_date"],
                        )

                # convert per_stock dict to list for JSON
                account_entry["per_stock"] = list(account_entry["per_stock"].values())

            # convert accounts dict to list
            country_entry["accounts"] = list(country_entry["accounts"].values())

        countries_list = list(countries.values())

        return jsonify(
            {
                # Top-level cards
                "total_net_worth": total_net_worth,
                "total_stock_value": total_stock_value,
                "total_property_value": total_property_value,
                "total_profit_loss": total_profit_loss,
                # Detailed aggregates
                "grand_totals": grand_totals,
                "countries": countries_list,
            }
        )

    # ---------------- ANALYTICS (TIME SERIES & HISTOGRAMS) ----------------

    @app.route("/analytics", methods=["GET"])
    def get_analytics():
        """
        Returns:
        - Net worth & invested assets over time (by purchase date)
        - Allocation pie data
        - CAGR histogram per asset

        NOTE: Without historical price data, we approximate net worth over time
        using today's valuations applied back to each asset's purchase date.
        """
        assets = Asset.query.order_by(Asset.purchase_date.asc()).all()

        # Precompute per-asset metrics used across analytics
        per_asset = []
        for a in assets:
            # Fetch live prices for stocks and mutual funds
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

        # ---------- Net worth / assets over time ----------
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
                {
                    "date": d.isoformat(),
                    "net_worth": net_worth,
                    "assets_value": assets_value,
                }
            )

        # ---------- Allocation pie (by asset type) ----------
        allocation_map = {}
        for item in per_asset:
            asset_type = item["asset"].asset_type
            allocation_map.setdefault(asset_type, 0.0)
            allocation_map[asset_type] += item["current_value"]

        allocation = [
            {"label": asset_type, "value": value}
            for asset_type, value in allocation_map.items()
        ]

        # ---------- CAGR histogram (per asset) ----------
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

    # ---------------- SEARCH SYMBOLS (AUTOCOMPLETE) ----------------
    
    @app.route("/search-symbols", methods=["GET"])
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
        
        # If searching for mutual funds, prioritize AMFI results
        if asset_type == "mutual_fund":
            # For mutual funds, only search AMFI (not stocks)
            if not country or country == "India":
                mf_results = _search_mutual_fund_symbols(query)
                results.extend(mf_results)
        else:
            # For stocks, search stock exchanges
            # Search Finnhub for US stocks
            if not country or country == "United States":
                finnhub_results = _search_finnhub_symbols(query)
                results.extend(finnhub_results)
            
            # Search NSE for Indian stocks (only if not searching for mutual funds)
            if not country or country == "India":
                nse_results = _search_nse_symbols(query)
                results.extend(nse_results)
                
                # Also include mutual funds in general search (but prioritize stocks)
                mf_results = _search_mutual_fund_symbols(query)
                results.extend(mf_results)
        
        # Remove duplicates and limit results
        # Prioritize results based on asset_type
        seen = set()
        unique_results = []
        
        # If searching for mutual funds, prioritize AMFI results
        if asset_type == "mutual_fund":
            # Add AMFI results first
            for result in results:
                if result.get("exchange") == "AMFI":
                    key = (result["symbol"], result.get("exchange", ""))
                    if key not in seen:
                        seen.add(key)
                        unique_results.append(result)
            # Then add any other results
            for result in results:
                key = (result["symbol"], result.get("exchange", ""))
                if key not in seen:
                    seen.add(key)
                    unique_results.append(result)
        else:
            # For stocks, add all results in order
            for result in results:
                key = (result["symbol"], result.get("exchange", ""))
                if key not in seen:
                    seen.add(key)
                    unique_results.append(result)
        
        # Limit to 20 results
        return jsonify(unique_results[:20])
    
    def _search_finnhub_symbols(query):
        """Search symbols using Finnhub API."""
        if not FINNHUB_API_KEY:
            return []
        
        try:
            url = "https://finnhub.io/api/v1/search"
            params = {
                "q": query,
                "token": FINNHUB_API_KEY,
            }
            response = requests.get(url, params=params, timeout=3)
            response.raise_for_status()
            data = response.json()
            
            results = []
            # Finnhub returns: {"count": N, "result": [{"description": "...", "displaySymbol": "...", "symbol": "...", "type": "..."}, ...]}
            for item in data.get("result", [])[:10]:  # Limit to 10 from Finnhub
                symbol = item.get("symbol", "")
                display_symbol = item.get("displaySymbol", symbol)
                description = item.get("description", "")
                symbol_type = item.get("type", "")
                
                # Only include stocks and common stock types
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
        """Search symbols using NSE libraries."""
        results = []
        
        # Common NSE symbols list (top stocks)
        # In production, you'd fetch this from NSE API or maintain a symbol list
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
        
        # Search in symbol and name
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
        """Search mutual fund schemes using mftool."""
        print(f"[DEBUG] _search_mutual_fund_symbols called with query: '{query}'")
        print(f"[DEBUG] MFTOOL_AVAILABLE: {MFTOOL_AVAILABLE}")
        print(f"[DEBUG] mf instance: {mf}")
        
        if not MFTOOL_AVAILABLE:
            print("[WARN] mftool not available - mutual fund search disabled. Install with: pip install mftool")
            # Try to import directly anyway
            try:
                from mftool import Mftool
                print("[DEBUG] Successfully imported Mftool directly")
                mf_instance = Mftool()
            except ImportError as e:
                print(f"[ERROR] mftool import failed: {e}")
                return []
        else:
            # Use the global mf instance from utils if available, otherwise create new one
            try:
                if mf is not None:
                    print("[DEBUG] Using global mf instance from utils")
                    mf_instance = mf
                else:
                    print("[DEBUG] Creating new Mftool instance")
                    from mftool import Mftool
                    mf_instance = Mftool()
            except Exception as e:
                print(f"[ERROR] Failed to get mftool instance: {e}")
                return []
        
        try:
            # Get all schemes
            print("[DEBUG] Fetching all scheme codes from mftool...")
            all_schemes = mf_instance.get_all_scheme_codes()
            print(f"[DEBUG] Got {len(all_schemes) if all_schemes else 0} schemes from mftool")
            
            if not all_schemes:
                print("[WARN] mftool returned empty schemes list")
                return []
            
            results = []
            query_upper = query.upper()
            print(f"[DEBUG] Searching for '{query_upper}' in {len(all_schemes)} schemes...")
            
            # Search through schemes
            for scheme_code, scheme_name in all_schemes.items():
                # Search in scheme name or code
                if query_upper in scheme_name.upper() or query_upper in str(scheme_code):
                    results.append({
                        "symbol": str(scheme_code),  # AMFI scheme code
                        "displaySymbol": str(scheme_code),
                        "description": scheme_name,
                        "exchange": "AMFI",
                        "country": "India",
                    })
                    if len(results) >= 10:  # Limit to 10 results
                        break
            
            print(f"[DEBUG] Found {len(results)} mutual fund results for query '{query}'")
            return results
        except Exception as e:
            print(f"[ERROR] Mutual fund symbol search failed: {e}")
            import traceback
            traceback.print_exc()
            return []

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5001)
