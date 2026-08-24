"""
Persistent price/FX caching on top of utils.py's raw API-fetch functions.

Checks price_history/exchange_rates first, calls out to the live APIs on a
miss, and writes the result back — so repeat lookups and the daily snapshot
job don't re-hit rate-limited free tiers every time.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func

from .models import db, PriceHistory, ExchangeRate

logger = logging.getLogger(__name__)
from .utils import (
    get_current_stock_price,
    get_crypto_price,
    get_crypto_historical_price,
    get_metal_price,
    get_historical_price_from_yahoo,
    get_historical_price_from_nsepy,
    get_historical_price_from_finnhub,
    get_exchange_rate as _fetch_exchange_rate,
)


def get_current_price(asset_type: str, symbol: str, currency: str = "USD") -> Optional[float]:
    """
    Live price for any priced asset type. Stock/mutual_fund prices come back
    in their home exchange's currency (USD for US stocks, INR for NSE/mutual
    funds), same as the original single-asset model; crypto/commodity prices
    are fetched directly in the requested currency.
    """
    if asset_type in ("stock", "mutual_fund"):
        return get_current_stock_price(symbol, asset_type=asset_type)
    if asset_type == "crypto":
        return get_crypto_price(symbol, currency=currency.lower())
    if asset_type == "commodity":
        return get_metal_price(symbol, currency=currency)
    return None


def _cache_price(asset_type: str, symbol: str, price_date: date, price: float, currency: str, source: str):
    existing = PriceHistory.query.filter_by(
        asset_type=asset_type, symbol=symbol, price_date=price_date
    ).first()
    if existing:
        existing.price = price
        existing.currency = currency
        existing.source = source
    else:
        db.session.add(PriceHistory(
            asset_type=asset_type, symbol=symbol, price_date=price_date,
            price=price, currency=currency, source=source,
        ))
    db.session.commit()


def _get_mftool_historical_nav(scheme_code: str, target_date: date) -> Optional[float]:
    from .utils import MFTOOL_AVAILABLE, mf
    if not MFTOOL_AVAILABLE or not mf:
        return None
    try:
        history = mf.get_scheme_historical_nav(str(scheme_code).strip())
        if not history or "data" not in history:
            return None
        target_str = target_date.strftime("%d-%m-%Y")
        for entry in history["data"]:
            if entry.get("date") == target_str:
                return float(entry.get("nav"))
        return None
    except Exception as e:
        logger.warning("mftool historical NAV fetch failed for %s: %s", scheme_code, e)
        return None


# Commodity holdings store 'gold'/'silver'/'platinum' (matching metals-api.com's
# symbol keys for live pricing) — these are NOT valid Yahoo tickers. 'GOLD' in
# particular silently resolves to an unrelated penny stock (Gold.com, Inc.),
# not the price of gold, so this mapping to real futures tickers is required
# for correctness, not just a nicety.
COMMODITY_YAHOO_TICKERS = {"gold": "GC=F", "silver": "SI=F", "platinum": "PL=F"}


def get_historical_price(asset_type: str, symbol: str, target_date: date, currency: str = "USD") -> Optional[float]:
    """
    Historical price on a specific date, DB-cached. Crypto (CoinGecko),
    Indian mutual funds (mftool), and stocks/commodities via Yahoo Finance
    (works for both US and NSE symbols, no key needed) are all reasonably
    reliable. Yahoo's endpoint is unofficial and undocumented, so NSEpy is
    kept as a fallback for NSE symbols specifically if it ever stops
    working; Finnhub's candle endpoint is confirmed 403/paid-only on the
    free tier (verified 2026-08-13) and is a last-resort fallback only.
    Returns None if nothing works, and the frontend offers manual entry.
    """
    cached = PriceHistory.query.filter_by(
        asset_type=asset_type, symbol=symbol, price_date=target_date
    ).first()
    if cached:
        return cached.price

    price = None
    source = None
    if asset_type == "crypto":
        price = get_crypto_historical_price(symbol, target_date, currency=currency.lower())
        source = "coingecko"
    elif asset_type == "mutual_fund":
        price = _get_mftool_historical_nav(symbol, target_date)
        source = "mftool"
    elif asset_type in ("stock", "commodity"):
        yahoo_symbol = COMMODITY_YAHOO_TICKERS.get(symbol.lower(), symbol) if asset_type == "commodity" else symbol
        price = get_historical_price_from_yahoo(yahoo_symbol, target_date)
        source = "yahoo"
        if price is None and (symbol.upper().endswith(".NS") or symbol.upper().endswith(".NSE")):
            price = get_historical_price_from_nsepy(symbol, target_date)
            source = "nsepy"
        elif price is None and asset_type == "stock":
            price = get_historical_price_from_finnhub(symbol, target_date)
            source = "finnhub"

    if price is not None:
        _cache_price(asset_type, symbol, target_date, price, currency, source)
    return price


def get_rate(from_currency: str, to_currency: str, target_date: Optional[date] = None) -> Optional[float]:
    """FX rate (1 from_currency = X to_currency), DB-cached per calendar day."""
    from_currency = (from_currency or "").upper()
    to_currency = (to_currency or "").upper()
    if not from_currency or not to_currency:
        return None
    if from_currency == to_currency:
        return 1.0

    rate_date = target_date or date.today()
    cached = ExchangeRate.query.filter_by(
        base_currency=from_currency, quote_currency=to_currency, rate_date=rate_date
    ).first()
    if cached:
        return cached.rate

    rate = _fetch_exchange_rate(from_currency, to_currency, target_date)
    if rate is not None:
        db.session.add(ExchangeRate(
            base_currency=from_currency, quote_currency=to_currency,
            rate_date=rate_date, rate=rate,
        ))
        db.session.commit()
    return rate


def get_cache_status() -> dict:
    """DB-cache health snapshot for the /price-cache-status endpoint. Reports
    table-level stats (row counts, freshness, breakdown by asset type) —
    there's no per-lookup hit/miss counter kept anywhere in this app, so this
    is cache *composition*, not a literal hit-rate percentage."""
    total_prices = db.session.query(func.count(PriceHistory.id)).scalar() or 0
    distinct_symbols = db.session.query(func.count(func.distinct(PriceHistory.symbol))).scalar() or 0
    by_asset_type = dict(
        db.session.query(PriceHistory.asset_type, func.count(PriceHistory.id)).group_by(PriceHistory.asset_type).all()
    )
    added_last_24h = (
        db.session.query(func.count(PriceHistory.id))
        .filter(PriceHistory.created_at >= datetime.utcnow() - timedelta(hours=24))
        .scalar()
        or 0
    )
    oldest_price_date = db.session.query(func.min(PriceHistory.price_date)).scalar()
    newest_price_date = db.session.query(func.max(PriceHistory.price_date)).scalar()

    total_rates = db.session.query(func.count(ExchangeRate.id)).scalar() or 0
    newest_rate_date = db.session.query(func.max(ExchangeRate.rate_date)).scalar()

    return {
        "price_history": {
            "total_rows": total_prices,
            "distinct_symbols": distinct_symbols,
            "rows_added_last_24h": added_last_24h,
            "by_asset_type": by_asset_type,
            "oldest_price_date": oldest_price_date.isoformat() if oldest_price_date else None,
            "newest_price_date": newest_price_date.isoformat() if newest_price_date else None,
        },
        "exchange_rates": {
            "total_rows": total_rates,
            "newest_rate_date": newest_rate_date.isoformat() if newest_rate_date else None,
        },
    }


def convert(amount: float, from_currency: str, to_currency: str) -> float:
    """Convert using the latest cached/live rate. Falls back to the original,
    unconverted amount if no rate is available, rather than failing the
    request over a currency-conversion hiccup."""
    if not from_currency or not to_currency or from_currency == to_currency:
        return amount
    rate = get_rate(from_currency, to_currency)
    if rate is None:
        return amount
    return amount * rate
