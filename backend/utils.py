import os
import requests
from datetime import date, timedelta
from time import time

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
    print(f"[utils.py] mftool initialized successfully, mf instance: {mf is not None}")
except ImportError as e:
    MFTOOL_AVAILABLE = False
    mf = None
    print(f"[utils.py] mftool import failed: {e}")
except Exception as e:
    MFTOOL_AVAILABLE = False
    mf = None
    print(f"[utils.py] mftool initialization failed: {e}")
    import traceback
    traceback.print_exc()

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")

# Price cache: {ticker: (price, timestamp)}
# Cache prices for 5 minutes to avoid repeated API calls
_PRICE_CACHE = {}
_CACHE_TTL = 300  # 5 minutes in seconds


def _get_price_from_finnhub(ticker: str):
    """
    Get current price from Finnhub API.
    PRIMARY method for US stocks when FINNHUB_API_KEY is set.
    """
    if not FINNHUB_API_KEY:
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
            print(f"Finnhub empty response for {ticker}")
            return None

        # Check for API errors
        if "error" in data:
            print(f"Finnhub API error for {ticker}: {data.get('error')}")
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
            print(f"Finnhub no valid price for {ticker}, response: {data}")
            return None

        price_float = float(price)
        if price_float <= 0:
            print(f"Finnhub invalid price for {ticker}: {price_float}")
            return None

        return price_float
    except requests.exceptions.Timeout:
        print(f"Finnhub timeout for {ticker}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Finnhub network error for {ticker}: {e}")
        return None
    except (ValueError, TypeError) as e:
        print(f"Finnhub data parsing error for {ticker}: {e}")
        return None
    except Exception as e:
        print(f"Finnhub price fetch failed for {ticker}: {e}")
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
        print(f"nselib price fetch failed for {ticker}: {e}")
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
        data = nsefetch(quote_url)
        
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
        print(f"nsepython price fetch failed for {ticker}: {e}")
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
        hist = nsepy_get_history(
            symbol=symbol,
            start=start_date,
            end=end_date
        )
        
        if hist is None or hist.empty:
            return None
        
        # Get the latest close price
        price = float(hist["Close"].iloc[-1])
        if not price or price == 0:
            return None
        return price
    except Exception as e:
        print(f"NSEpy price fetch failed for {ticker}: {e}")
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
        quote = mf.get_scheme_quote(scheme_code_str)
        
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
        print(f"mftool NAV fetch failed for scheme {scheme_code}: {e}")
        return None


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
        price = _get_price_from_finnhub(ticker)
        if price:
            return price
        
        # No price found for NSE stock
        return None
    
    # For US and other non-NSE stocks:
    # 1) Try Finnhub FIRST (primary for US stocks if API key is set)
    if FINNHUB_API_KEY:
        price = _get_price_from_finnhub(ticker)
        if price:
            return price
    
    # If it's a mutual fund but mftool didn't work, try other sources
    if asset_type == "mutual_fund":
        # Try Finnhub as fallback for mutual funds (might have some MF data)
        if FINNHUB_API_KEY:
            price = _get_price_from_finnhub(ticker)
            if price:
                return price
    
    # No price found
    return None