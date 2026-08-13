"""
Portfolio return vs a benchmark index, using real ETF proxies (SPY for the
S&P 500, NIFTYBEES.NS for the Nifty 50) priced through the existing
Finnhub/NSE infrastructure — no new data source needed.

Simplification, stated plainly: only buy transactions are replayed into the
benchmark leg (sells are excluded from it) — a common, simple approximation
for "what if you'd bought the index instead." Cash flow dates/amounts match
your real buys exactly; only the price used to compute how much benchmark
you'd own differs. The real portfolio's XIRR here uses the same buy-only
simplification so the two numbers are apples-to-apples.
"""
from datetime import date
from typing import Dict, Optional

from .models import HoldingTransaction, Holding
from .holdings_service import QUANTITY_BASED_TYPES, list_holdings_with_metrics
from . import price_service
from .finance import xirr

BENCHMARKS = {
    "SPY": {"label": "S&P 500 (SPY)"},
    "NIFTYBEES.NS": {"label": "Nifty 50 (NIFTYBEES)"},
}


def get_benchmark_comparison(user_id, benchmark_symbol: str = "SPY", household_id=None) -> Optional[Dict]:
    if benchmark_symbol not in BENCHMARKS:
        return None

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

    portfolio_cash_flows = []
    benchmark_units = 0.0
    skipped = 0

    for t in buys:
        amount = t.quantity * t.price_per_unit + t.fees
        portfolio_cash_flows.append((t.transaction_date, -amount))

        benchmark_price = price_service.get_historical_price("stock", benchmark_symbol, t.transaction_date, "USD")
        if benchmark_price:
            benchmark_units += amount / benchmark_price
        else:
            skipped += 1

    current_benchmark_price = price_service.get_current_price("stock", benchmark_symbol, "USD")
    if not current_benchmark_price or benchmark_units == 0:
        return None

    benchmark_value = benchmark_units * current_benchmark_price
    benchmark_xirr = xirr(portfolio_cash_flows + [(date.today(), benchmark_value)])

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
