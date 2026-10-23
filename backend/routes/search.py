"""Routes: search. Moved out of app.py unchanged; shared helpers come in through `h`."""
import logging
import os

import requests
from flask import jsonify, request

from ..auth import require_auth
from ..services import rank_symbol_results
from ..utils import FINNHUB_API_KEY

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
            logger.warning("CoinGecko search failed: %s", e)
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
            logger.warning("Finnhub symbol search failed: %s", e)
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
            logger.warning("NSE symbol search failed: %s", e)
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
        mf_instance = get_mf_instance()
        if mf_instance is None:
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
            logger.error("Mutual fund symbol search failed: %s", e)
            return []
