import concurrent.futures
import logging
import os
from datetime import date, timedelta
from time import time

import requests

logger = logging.getLogger(__name__)


def _with_timeout(fn, timeout, *args, **kwargs):
    """Bounds a call into a third-party library (nsefetch, nsepy, mftool)
    that has no timeout parameter of its own — unlike every direct
    requests.get/post call in this file, which already passes one. Python
    can't forcibly kill a running thread, so on timeout the background
    call is abandoned (not joined) rather than blocking the caller until
    it eventually finishes on its own: the fallback chain these are all
    part of needs the worker back, not a delayed exception after the real
    hang duration."""
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return executor.submit(fn, *args, **kwargs).result(timeout=timeout)
    finally:
        executor.shutdown(wait=False)

# Optional NSE library imports for Indian stocks (multiple fallbacks)
try:
    from nsepy import get_history as nsepy_get_history
    NSEPY_AVAILABLE = True
except ImportError:
    NSEPY_AVAILABLE = False
    nsepy_get_history = None

try:
    from nselib import get_quote
    NSELIB_AVAILABLE = True
except ImportError:
    NSELIB_AVAILABLE = False
    get_quote = None

try:
    from nsepython import nsefetch
    NSEPYTHON_AVAILABLE = True
except ImportError:
    NSEPYTHON_AVAILABLE = False
    nsefetch = None

# Optional mftool import for Indian mutual funds
try:
    from mftool import Mftool
    MFTOOL_AVAILABLE = True
    mf = Mftool()  # Initialize mftool instance
    logger.info("mftool initialized successfully, mf instance: %s", mf is not None)
except ImportError as e:
    MFTOOL_AVAILABLE = False
    mf = None
    logger.warning("mftool import failed: %s", e)
except Exception as e:
    MFTOOL_AVAILABLE = False
    mf = None
    logger.warning("mftool initialization failed: %s", e, exc_info=True)

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")

# Price cache: {ticker: (price, timestamp)}
# Cache prices for 5 minutes to avoid repeated API calls
_PRICE_CACHE = {}
_CACHE_TTL = 300  # 5 minutes in seconds


def _get_price_from_finnhub(ticker: str, asset_type: str = None):
    """
    Get current price from Finnhub API.
    PRIMARY method for US stocks when FINNHUB_API_KEY is set.
    """
    if not FINNHUB_API_KEY:
        return None

    # Finnhub's free tier returns 403 for NSE-listed symbols and mutual
    # funds — not a transient error, so skip the call entirely instead of
    # logging a 403 on every price fetch.
    upper_ticker = (ticker or "").upper().strip()
    if upper_ticker.endswith(".NS") or upper_ticker.endswith(".NSE"):
        logger.debug("Skipping Finnhub for NSE-listed symbol %s (unsupported on free tier)", ticker)
        return None
    if asset_type == "mutual_fund":
        logger.debug("Skipping Finnhub for mutual fund symbol %s (unsupported on free tier)", ticker)
        return None

    try:
        # Clean ticker - remove any exchange suffixes for US stocks
        clean_ticker = ticker.upper().strip()
        # Remove common suffixes that might interfere
        if clean_ticker.endswith(".US"):
            clean_ticker = clean_ticker[:-3]
        
        url = "https://finnhub.io/api/v1/quote"
        params = {
            "symbol": clean_ticker,
            "token": FINNHUB_API_KEY,
        }
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()

        # Check if response is empty or None
        if not data:
            logger.warning("Finnhub empty response for %s", ticker)
            return None

        # Check for API errors
        if "error" in data:
            logger.warning("Finnhub API error for %s: %s", ticker, data.get("error"))
            return None

        # Finnhub quote endpoint returns:
        # {
        #   "c": current price,
        #   "d": change,
        #   "dp": percent change,
        #   "h": high price of the day,
        #   "l": low price of the day,
        #   "o": open price of the day,
        #   "pc": previous close price,
        #   "t": timestamp
        # }
        price = data.get("c")
        
        # If current price is not available, try previous close
        if price is None or price == 0:
            price = data.get("pc")  # previous close
        
        if price is None or price == 0:
            logger.warning("Finnhub no valid price for %s, response: %s", ticker, data)
            return None

        price_float = float(price)
        if price_float <= 0:
            logger.warning("Finnhub invalid price for %s: %s", ticker, price_float)
            return None

        return price_float
    except requests.exceptions.Timeout:
        logger.warning("Finnhub timeout for %s", ticker)
        return None
    except requests.exceptions.RequestException as e:
        logger.warning("Finnhub network error for %s: %s", ticker, e)
        return None
    except (ValueError, TypeError) as e:
        logger.warning("Finnhub data parsing error for %s: %s", ticker, e)
        return None
    except Exception as e:
        logger.warning("Finnhub price fetch failed for %s: %s", ticker, e)
        return None

def _get_price_from_nselib(ticker: str):
    """
    Get current price from nselib for Indian NSE stocks.
    nselib is compatible with the new NSE website.
    """
    if not NSELIB_AVAILABLE:
        return None
    
    try:
        # Remove .NS or .NSE suffix if present
        symbol = ticker.upper().replace(".NS", "").replace(".NSE", "")
        
        # Get quote data
        quote_data = get_quote(symbol)
        if not quote_data:
            return None
        
        # Extract last price from quote
        price = quote_data.get("lastPrice") or quote_data.get("lastprice") or quote_data.get("ltp")
        if price is None:
            return None
        
        price = float(price)
        if not price or price == 0:
            return None
        return price
    except Exception as e:
        logger.warning("nselib price fetch failed for %s: %s", ticker, e)
        return None



def _get_price_from_nsepython(ticker: str):
    """
    Get current price from nsepython for Indian NSE stocks.
    Supports both live and historical data.
    """
    if not NSEPYTHON_AVAILABLE:
        return None
    
    try:
        # Remove .NS or .NSE suffix if present
        symbol = ticker.upper().replace(".NS", "").replace(".NSE", "")
        
        # Fetch quote data
        quote_url = f"https://www.nseindia.com/api/quote-equity?symbol={symbol}"
        data = _with_timeout(nsefetch, 5, quote_url)
        
        if not data:
            return None
        
        # Extract price from response
        price = data.get("priceInfo", {}).get("lastPrice") or data.get("lastPrice")
        if price is None:
            return None
        
        price = float(price)
        if not price or price == 0:
            return None
        return price
    except Exception as e:
        logger.warning("nsepython price fetch failed for %s: %s", ticker, e)
        return None



def _get_price_from_nsepy(ticker: str):
    """
    Get current price from NSEpy for Indian NSE stocks.
    Works for tickers ending in .NS or .NSE, or without suffix for NSE stocks.
    """
    if not NSEPY_AVAILABLE:
        return None
    
    try:
        # Remove .NS or .NSE suffix if present, NSEpy expects just the symbol
        symbol = ticker.upper().replace(".NS", "").replace(".NSE", "")
        
        # Get the latest trading day's data (last 5 days to account for weekends/holidays)
        end_date = date.today()
        start_date = end_date - timedelta(days=5)
        
        # Fetch historical data
        hist = _with_timeout(nsepy_get_history, 5, symbol=symbol, start=start_date, end=end_date)
        
        if hist is None or hist.empty:
            return None
        
        # Get the latest close price
        price = float(hist["Close"].iloc[-1])
        if not price or price == 0:
            return None
        return price
    except Exception as e:
        logger.warning("NSEpy price fetch failed for %s: %s", ticker, e)
        return None


def get_historical_price_from_nsepy(ticker: str, target_date: date):
    """Historical close price for an NSE stock on/just before target_date.
    Widens the lookback window to cover weekends/holidays."""
    if not NSEPY_AVAILABLE:
        return None
    try:
        symbol = ticker.upper().replace(".NS", "").replace(".NSE", "")
        start_date = target_date - timedelta(days=7)
        hist = _with_timeout(nsepy_get_history, 5, symbol=symbol, start=start_date, end=target_date)
        if hist is None or hist.empty:
            return None
        price = float(hist["Close"].iloc[-1])
        return price if price > 0 else None
    except Exception as e:
        logger.warning("NSEpy historical price fetch failed for %s: %s", ticker, e)
        return None


def get_historical_price_from_finnhub(ticker: str, target_date: date):
    """
    Historical daily close via Finnhub's /stock/candle endpoint. Kept as a
    fallback, but verified (2026-08-13) that this endpoint returns 403 on
    the free tier — it's paid-only despite live quotes working fine.
    get_historical_price_from_yahoo is the primary historical source now.
    """
    if not FINNHUB_API_KEY:
        return None
    try:
        import calendar

        start = target_date - timedelta(days=5)
        from_ts = calendar.timegm(start.timetuple())
        to_ts = calendar.timegm((target_date + timedelta(days=1)).timetuple())

        response = requests.get(
            "https://finnhub.io/api/v1/stock/candle",
            params={"symbol": ticker.upper(), "resolution": "D", "from": from_ts, "to": to_ts, "token": FINNHUB_API_KEY},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("s") != "ok" or not data.get("c"):
            return None
        price = float(data["c"][-1])
        return price if price > 0 else None
    except Exception as e:
        logger.warning("Finnhub historical price fetch failed for %s: %s", ticker, e)
        return None


def get_historical_price_from_yahoo(ticker: str, target_date: date):
    """
    Historical daily close via Yahoo Finance's unofficial chart API — free,
    keyless, and works for both US tickers (SPY) and NSE tickers
    (RELIANCE.NS) with the same call, unlike Finnhub (US-only, paid-tier
    candle endpoint) or NSEpy (NSE-only, scraping-based). This is the
    primary historical price source; Finnhub/NSEpy remain as fallbacks
    since this is an unofficial, undocumented endpoint that could change.
    """
    try:
        import calendar

        start = target_date - timedelta(days=5)
        period1 = calendar.timegm(start.timetuple())
        period2 = calendar.timegm((target_date + timedelta(days=1)).timetuple())

        response = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}",
            params={"period1": period1, "period2": period2, "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        response.raise_for_status()
        result = response.json().get("chart", {}).get("result")
        if not result:
            return None
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        closes = [c for c in closes if c is not None]
        if not closes:
            return None
        price = float(closes[-1])
        return price if price > 0 else None
    except Exception as e:
        logger.warning("Yahoo historical price fetch failed for %s: %s", ticker, e)
        return None



def _get_price_from_mftool(scheme_code: str):
    """
    Get current NAV (Net Asset Value) for Indian mutual funds using mftool.
    scheme_code should be the AMFI scheme code (e.g., "120503").
    """
    if not MFTOOL_AVAILABLE or not mf:
        return None
    
    try:
        # mftool expects scheme code as string
        scheme_code_str = str(scheme_code).strip()
        
        # Get quote for the mutual fund scheme
        quote = _with_timeout(mf.get_scheme_quote, 6, scheme_code_str)
        
        if not quote:
            return None
        
        # mftool returns NAV in different formats depending on the method
        # get_scheme_quote returns: {'scheme_code': '...', 'scheme_name': '...', 'nav': '...', ...}
        nav = quote.get('nav') or quote.get('last_updated_nav')
        
        if nav:
            # NAV might be a string, convert to float
            nav_float = float(str(nav).replace(',', ''))
            if nav_float > 0:
                return nav_float
        
        return None
    except Exception as e:
        logger.warning("mftool NAV fetch failed for scheme %s: %s", scheme_code, e)
        return None


def _get_price_from_yahoo(ticker: str):
    """Current price via Yahoo Finance's unofficial chart API (most recent
    close within a lookback window) — works for both US and NSE tickers with
    no key. Verified 2026-08-13: the entire nselib/nsepython/nsepy chain is
    down against NSE's current site, and Finnhub 403s on NSE symbols on the
    free tier, so this is the one source that reliably works for NSE stocks
    right now."""
    return get_historical_price_from_yahoo(ticker, date.today())


def get_current_stock_price(ticker: str, asset_type: str = None):
    """
    Get current stock price or mutual fund NAV with optimized fallback chain and caching.
    
    For Indian NSE stocks (.NS, .NSE):
    1. nselib (compatible with new NSE website, most reliable)
    2. nsepython (supports live data)
    3. NSEpy (historical data)
    4. Finnhub (if FINNHUB_API_KEY is set)
    
    For Indian Mutual Funds (AMFI scheme codes):
    1. mftool (AMFI NAV data)
    
    For US and other stocks (no .NS suffix):
    1. Finnhub (if FINNHUB_API_KEY is set) - PRIMARY for US stocks
    
    Prices are cached for 5 minutes to avoid repeated API calls.
    
    Args:
        ticker: Stock symbol or mutual fund scheme code
        asset_type: Optional asset type ('mutual_fund', 'stock', etc.) to help determine data source
    """
    ticker = (ticker or "").strip().upper()
    if not ticker:
        return None

    # Check cache first
    current_time = time()
    cache_key = f"{ticker}_{asset_type or 'stock'}"  # Include asset_type in cache key
    if cache_key in _PRICE_CACHE:
        cached_price, cached_time = _PRICE_CACHE[cache_key]
        if current_time - cached_time < _CACHE_TTL:
            return cached_price
        # Cache expired, remove it
        del _PRICE_CACHE[cache_key]

    # Fetch fresh price
    price = _fetch_price_with_fallbacks(ticker, asset_type)
    
    # Cache the result (even if None, to avoid repeated failed lookups)
    if price is not None:
        _PRICE_CACHE[cache_key] = (price, current_time)
    
    return price


def _fetch_price_with_fallbacks(ticker: str, asset_type: str = None):
    """Internal function to fetch price without cache check."""
    # Check if this is a mutual fund - try mftool first for Indian mutual funds
    if asset_type == "mutual_fund":
        # For mutual funds, try mftool (AMFI scheme codes)
        if MFTOOL_AVAILABLE:
            price = _get_price_from_mftool(ticker)
            if price:
                return price
    
    # Check if this is an Indian NSE stock (ends with .NS or .NSE)
    is_nse_stock = ticker.endswith(".NS") or ticker.endswith(".NSE")
    
    # For NSE stocks, try multiple NSE libraries in order
    if is_nse_stock:
        # 1) Try nselib first (most compatible with new NSE website)
        price = _get_price_from_nselib(ticker)
        if price:
            return price
        
        # 2) Try nsepython (supports live data)
        price = _get_price_from_nsepython(ticker)
        if price:
            return price
        
        # 3) Try NSEpy (historical data)
        price = _get_price_from_nsepy(ticker)
        if price:
            return price
        
        # 4) Fallback to Finnhub for NSE stocks
        price = _get_price_from_finnhub(ticker, asset_type)
        if price:
            return price

        # 5) Fallback to Yahoo Finance (unofficial, but currently the only
        # source that reliably works for NSE stocks — see _get_price_from_yahoo)
        price = _get_price_from_yahoo(ticker)
        if price:
            return price

        # No price found for NSE stock
        return None

    # For US and other non-NSE stocks:
    # 1) Try Finnhub FIRST (primary for US stocks if API key is set)
    if FINNHUB_API_KEY:
        price = _get_price_from_finnhub(ticker, asset_type)
        if price:
            return price

    # If it's a mutual fund but mftool didn't work, try other sources
    if asset_type == "mutual_fund":
        # Try Finnhub as fallback for mutual funds (might have some MF data)
        if FINNHUB_API_KEY:
            price = _get_price_from_finnhub(ticker, asset_type)
            if price:
                return price

    # Last resort for stocks: Yahoo Finance (covers the case where Finnhub
    # is rate-limited, unset, or the symbol isn't one it knows)
    if asset_type != "mutual_fund":
        price = _get_price_from_yahoo(ticker)
        if price:
            return price

    # No price found
    return None


# ---------------------------------------------------------------------------
# Crypto (CoinGecko — free, keyless), commodities (metals-api.com — free key),
# and FX (frankfurter.app — free, keyless). Same in-memory 5-minute cache
# pattern as the stock price fetching above; persistent caching into
# price_history/exchange_rates is layered on top in price_service.py.
# ---------------------------------------------------------------------------

METALS_API_KEY = os.environ.get("METALS_API_KEY")

# metals-api.com symbol for each supported commodity
METAL_SYMBOLS = {"gold": "XAU", "silver": "XAG", "platinum": "XPT"}


def get_crypto_price(coingecko_id: str, currency: str = "usd"):
    """Live price for a CoinGecko coin id (e.g. 'bitcoin', 'ethereum') in the
    given currency. Free public endpoint, no API key required."""
    coingecko_id = (coingecko_id or "").strip().lower()
    currency = (currency or "usd").strip().lower()
    if not coingecko_id:
        return None

    cache_key = f"crypto_{coingecko_id}_{currency}"
    current_time = time()
    if cache_key in _PRICE_CACHE:
        cached_price, cached_time = _PRICE_CACHE[cache_key]
        if current_time - cached_time < _CACHE_TTL:
            return cached_price

    try:
        response = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": coingecko_id, "vs_currencies": currency},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        price = data.get(coingecko_id, {}).get(currency)
        if price is None:
            return None
        price = float(price)
        _PRICE_CACHE[cache_key] = (price, current_time)
        return price
    except Exception as e:
        logger.warning("CoinGecko price fetch failed for %s: %s", coingecko_id, e)
        return None


def get_crypto_historical_price(coingecko_id: str, target_date: date, currency: str = "usd"):
    """Historical price for a CoinGecko coin on a specific date."""
    coingecko_id = (coingecko_id or "").strip().lower()
    if not coingecko_id:
        return None
    try:
        response = requests.get(
            f"https://api.coingecko.com/api/v3/coins/{coingecko_id}/history",
            params={"date": target_date.strftime("%d-%m-%Y"), "localization": "false"},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        price = data.get("market_data", {}).get("current_price", {}).get(currency.lower())
        return float(price) if price is not None else None
    except Exception as e:
        logger.warning("CoinGecko historical price fetch failed for %s: %s", coingecko_id, e)
        return None


def get_metal_price(metal: str, currency: str = "USD"):
    """
    Live price for one troy ounce of gold/silver/platinum, via metals-api.com.
    Requires METALS_API_KEY (free tier). Returns None if the key isn't set
    or the request fails — callers should treat that as "price unavailable",
    same as an unconfigured FINNHUB_API_KEY.
    """
    if not METALS_API_KEY:
        return None

    symbol = METAL_SYMBOLS.get((metal or "").strip().lower())
    if not symbol:
        return None

    currency = (currency or "USD").strip().upper()
    cache_key = f"metal_{symbol}_{currency}"
    current_time = time()
    if cache_key in _PRICE_CACHE:
        cached_price, cached_time = _PRICE_CACHE[cache_key]
        if current_time - cached_time < _CACHE_TTL:
            return cached_price

    try:
        response = requests.get(
            "https://metals-api.com/api/latest",
            params={"access_key": METALS_API_KEY, "base": currency, "symbols": symbol},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        if not data.get("success", True) and "rates" not in data:
            logger.warning("metals-api error: %s", data.get("error"))
            return None
        # metals-api returns rates as "units of the metal per 1 unit of base
        # currency" (a troy-oz fraction), not a price — invert to get price.
        rate = data.get("rates", {}).get(symbol)
        if not rate or rate <= 0:
            return None
        price = 1.0 / float(rate)
        _PRICE_CACHE[cache_key] = (price, current_time)
        return price
    except Exception as e:
        logger.warning("metals-api price fetch failed for %s: %s", metal, e)
        return None


def get_exchange_rate(from_currency: str, to_currency: str, target_date: date = None):
    """
    FX rate (1 from_currency = X to_currency) via frankfurter.app — free,
    keyless, ECB-based. target_date=None fetches the latest rate.
    """
    from_currency = (from_currency or "").strip().upper()
    to_currency = (to_currency or "").strip().upper()
    if not from_currency or not to_currency:
        return None
    if from_currency == to_currency:
        return 1.0

    cache_key = f"fx_{from_currency}_{to_currency}_{target_date or 'latest'}"
    current_time = time()
    if cache_key in _PRICE_CACHE:
        cached_rate, cached_time = _PRICE_CACHE[cache_key]
        if current_time - cached_time < _CACHE_TTL:
            return cached_rate

    try:
        path = target_date.isoformat() if target_date else "latest"
        response = requests.get(
            f"https://api.frankfurter.app/{path}",
            params={"from": from_currency, "to": to_currency},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        rate = data.get("rates", {}).get(to_currency)
        if rate is None:
            return None
        rate = float(rate)
        _PRICE_CACHE[cache_key] = (rate, current_time)
        return rate
    except Exception as e:
        logger.warning("frankfurter.app FX fetch failed for %s->%s: %s", from_currency, to_currency, e)
        return None