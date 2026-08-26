"""
Portfolio return vs a benchmark index, using real ETF proxies (SPY for the
S&P 500, NIFTYBEES.NS for the Nifty 50) priced through the existing
Finnhub/Yahoo/NSE infrastructure — no new data source needed.

Simplification, stated plainly: only buy transactions are replayed into the
benchmark leg (sells are excluded from it) — a common, simple approximation
for "what if you'd bought the index instead." Cash flow dates match your
real buys exactly; only the price used to compute how much benchmark you'd
own differs. The real portfolio's XIRR here uses the same buy-only
simplification so the two numbers are apples-to-apples.

Currency handling matters here: holdings can be in different currencies
(a US stock in USD, an NSE stock in INR) and the benchmark itself trades in
its own native currency (SPY in USD, NIFTYBEES in INR) — every amount is
converted to USD before being combined into a single cash-flow series, and
separately into the benchmark's native currency to compute unit purchases,
since get_historical_price/get_current_price return prices in the ticker's
native trading currency, not an arbitrary requested one.
"""
from datetime import date
from typing import Dict, Optional

from . import price_service
from .finance import xirr
from .holdings_service import QUANTITY_BASED_TYPES, list_holdings_with_metrics
from .models import Holding, HoldingTransaction

BENCHMARKS = {
    "SPY": {"label": "S&P 500 (SPY)", "currency": "USD"},
    "NIFTYBEES.NS": {"label": "Nifty 50 (NIFTYBEES)", "currency": "INR"},
}


def replay_buys_into_cash_flows(buys, benchmark_symbol: str, benchmark_currency: str, get_historical_price=None, convert=None) -> Dict:
    """Pure replay of a list of buy transactions into two cash-flow series
    — split out from get_benchmark_comparison so this (the part that
    actually had the bug) is testable without a database or live price
    APIs. get_historical_price/convert default to the real price_service
    functions; tests inject fakes.

    Returns portfolio_cash_flows (every buy — what the real portfolio
    actually spent), benchmark_cash_flows (only buys where a benchmark
    price was found), benchmark_units, and skipped count.

    A buy whose benchmark-side price lookup fails still happened in the
    real portfolio, so it belongs in portfolio_cash_flows -- but it never
    became benchmark_units, so including its outflow in the benchmark's
    own XIRR would compare money that was never actually invested in the
    benchmark against the benchmark's ending value, understating the
    return (found by hand-computing an example: a single skipped buy
    turned a true ~16.5% benchmark XIRR into ~0%). Keeping
    benchmark_cash_flows as a separate list from portfolio_cash_flows is
    what fixes that.
    """
    get_historical_price = get_historical_price or price_service.get_historical_price
    convert = convert or price_service.convert

    portfolio_cash_flows = []
    benchmark_cash_flows = []
    benchmark_units = 0.0
    skipped = 0

    for t in buys:
        native_amount = t.quantity * t.price_per_unit + t.fees
        amount_usd = convert(native_amount, t.currency, "USD")
        portfolio_cash_flows.append((t.transaction_date, -amount_usd))

        benchmark_price = get_historical_price("stock", benchmark_symbol, t.transaction_date, benchmark_currency)
        if benchmark_price:
            amount_in_benchmark_currency = convert(native_amount, t.currency, benchmark_currency)
            benchmark_units += amount_in_benchmark_currency / benchmark_price
            benchmark_cash_flows.append((t.transaction_date, -amount_usd))
        else:
            skipped += 1

    return {
        "portfolio_cash_flows": portfolio_cash_flows,
        "benchmark_cash_flows": benchmark_cash_flows,
        "benchmark_units": benchmark_units,
        "skipped": skipped,
    }


def get_benchmark_comparison(user_id, benchmark_symbol: str = "SPY", household_id=None) -> Optional[Dict]:
    if benchmark_symbol not in BENCHMARKS:
        return None
    benchmark_currency = BENCHMARKS[benchmark_symbol]["currency"]

    if household_id:
        holdings = Holding.query.filter_by(household_id=household_id, is_private=False).all()
    else:
        holdings = Holding.query.filter_by(user_id=user_id).all()

    quantity_holdings = [h for h in holdings if h.asset_type in QUANTITY_BASED_TYPES]
    holding_ids = [h.id for h in quantity_holdings]
    if not holding_ids:
        return None

    buys = HoldingTransaction.query.filter(
        HoldingTransaction.holding_id.in_(holding_ids), HoldingTransaction.transaction_type == "buy"
    ).all()
    if not buys:
        return None

    replay = replay_buys_into_cash_flows(buys, benchmark_symbol, benchmark_currency)
    portfolio_cash_flows = replay["portfolio_cash_flows"]
    benchmark_cash_flows = replay["benchmark_cash_flows"]
    benchmark_units = replay["benchmark_units"]
    skipped = replay["skipped"]

    current_benchmark_price = price_service.get_current_price("stock", benchmark_symbol, benchmark_currency)
    if not current_benchmark_price or benchmark_units == 0:
        return None

    benchmark_value_native = benchmark_units * current_benchmark_price
    benchmark_value_usd = price_service.convert(benchmark_value_native, benchmark_currency, "USD")
    benchmark_xirr = xirr(benchmark_cash_flows + [(date.today(), benchmark_value_usd)])

    holdings_with_metrics = list_holdings_with_metrics(quantity_holdings, display_currency="USD")
    total_current_value = sum(h["display_value"] for h in holdings_with_metrics)
    portfolio_xirr_value = xirr(portfolio_cash_flows + [(date.today(), total_current_value)])

    return {
        "benchmark_symbol": benchmark_symbol,
        "benchmark_label": BENCHMARKS[benchmark_symbol]["label"],
        "portfolio_xirr": portfolio_xirr_value,
        "benchmark_xirr": benchmark_xirr,
        "buys_skipped_no_price": skipped,
        "buys_used": len(buys) - skipped,
    }
