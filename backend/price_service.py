"""
Persistent price/FX caching on top of utils.py's raw API-fetch functions.

Checks price_history/exchange_rates first, calls out to the live APIs on a
miss, and writes the result back — so repeat lookups and the daily snapshot
job don't re-hit rate-limited free tiers every time.
"""
from datetime import date
from typing import Optional

from .models import db, PriceHistory, ExchangeRate
from .utils import (
    get_current_stock_price,
    get_crypto_price,
    get_crypto_historical_price,
    get_metal_price,
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
        print(f"mftool historical NAV fetch failed for {scheme_code}: {e}")
        return None


def get_historical_price(asset_type: str, symbol: str, target_date: date, currency: str = "USD") -> Optional[float]:
    """
    Historical price on a specific date, DB-cached. Only crypto (CoinGecko)
    and Indian mutual funds (mftool) have reliable historical lookups here —
    US stock and NSE historical support is weak on the free tiers available,
    so this returns None for those and the frontend offers manual entry
    instead, exactly as scoped in the plan.
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
