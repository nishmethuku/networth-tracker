"""
Position and gain calculations for transaction-based holdings.

Mirrors services.py's role for the old single-row assets model, but works
off a holding's transaction ledger (quantity-based types: stock, mutual_fund,
crypto, commodity) or valuation history (everything else: real_estate,
fixed_deposit, ppf, epf, retirals, cash, loan, credit) instead of one frozen
buy price/quantity.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Dict, List, Optional

from . import price_service
from .finance import xirr
from .models import Holding, HoldingTransaction, HoldingValuation

QUANTITY_BASED_TYPES = ("stock", "mutual_fund", "crypto", "commodity")
VALUATION_BASED_TYPES = ("real_estate", "fixed_deposit", "ppf", "epf", "retirals", "cash", "loan", "credit")

# buy/sell change quantity and cost basis; dividend/interest are cash income
# that doesn't — a holding's share count and average cost are untouched by
# a dividend, but the amount still counts as real money received (folded
# into income_received below, and into XIRR/net-flow as a positive inflow).
TRANSACTION_TYPES = ("buy", "sell", "dividend", "interest")
INCOME_TRANSACTION_TYPES = ("dividend", "interest")


def compute_position(transactions: List[HoldingTransaction]) -> Dict:
    """
    Walk a holding's transactions in date order using the average cost
    method: each buy updates the running average cost; each sell reduces
    quantity and books realized gain against the average cost at the time
    of sale (average cost itself doesn't change on a sell). Dividend/
    interest transactions don't touch quantity or cost basis at all — they
    just accumulate into income_received, a separate figure from capital
    gains.
    """
    quantity = 0.0
    total_cost = 0.0
    realized_gain = 0.0
    income_received = 0.0
    realized_events = []  # [{date, amount}] — one per sell, for tax-year bucketing

    for t in sorted(transactions, key=lambda t: (t.transaction_date, t.id or 0)):
        if t.transaction_type == "buy":
            quantity += t.quantity
            total_cost += t.quantity * t.price_per_unit + t.fees
        elif t.transaction_type == "sell":
            avg_cost = (total_cost / quantity) if quantity > 0 else 0.0
            sell_qty = min(t.quantity, quantity)  # guard against bad data over-selling
            event_gain = (t.price_per_unit - avg_cost) * sell_qty - t.fees
            realized_gain += event_gain
            realized_events.append({"date": t.transaction_date, "amount": event_gain, "quantity": sell_qty})
            total_cost -= avg_cost * sell_qty
            quantity -= sell_qty
        elif t.transaction_type in INCOME_TRANSACTION_TYPES:
            income_received += t.quantity * t.price_per_unit - t.fees

    avg_cost = (total_cost / quantity) if quantity > 0 else 0.0

    return {
        "quantity": quantity,
        "realized_events": realized_events,
        "avg_cost": avg_cost,
        "cost_basis": total_cost,
        "realized_gain": realized_gain,
        "income_received": income_received,
    }


def _transaction_cash_flows(transactions: List[HoldingTransaction]):
    """Every transaction as a dated, signed cash flow for XIRR: a buy is
    money leaving the investor (negative); a sell or a dividend/interest
    payout is money coming back (positive) — a dividend is a real return
    just as much as a sale is, so XIRR should reflect it."""
    flows = []
    for t in transactions:
        amount = t.quantity * t.price_per_unit + (t.fees if t.transaction_type == "buy" else -t.fees)
        flows.append((t.transaction_date, -amount if t.transaction_type == "buy" else amount))
    return flows


def calculate_holding_metrics(
    holding: Holding,
    transactions: List[HoldingTransaction],
    current_price: Optional[float] = None,
) -> Dict:
    """
    Full metrics for a quantity-based holding (stock/mutual_fund/crypto/commodity).
    current_price: live price per unit in the holding's native currency; if None,
    falls back to avg_cost (current_value == cost_basis, zero unrealized gain) —
    same "don't fetch live prices on every request" tradeoff as the old model.
    """
    position = compute_position(transactions)
    quantity = position["quantity"]
    avg_cost = position["avg_cost"]
    price = current_price if current_price is not None else avg_cost

    current_value = quantity * price
    unrealized_gain = (price - avg_cost) * quantity if quantity > 0 else 0.0

    cash_flows = _transaction_cash_flows(transactions)
    if quantity > 0:
        cash_flows.append((date.today(), current_value))

    return {
        "quantity": quantity,
        "avg_cost": avg_cost,
        "cost_basis": position["cost_basis"],
        "current_price": price,
        "current_value": current_value,
        "realized_gain": position["realized_gain"],
        "unrealized_gain": unrealized_gain,
        "total_gain": position["realized_gain"] + unrealized_gain,
        "income_received": position["income_received"],
        "xirr": xirr(cash_flows),
    }


def calculate_valuation_metrics(holding: Holding, valuations: List[HoldingValuation]) -> Dict:
    """
    Metrics for a non-tradeable holding (real_estate/fixed_deposit/ppf/epf/
    retirals/cash/loan/credit): current value is the latest valuation entry;
    gain is the change since the first entry. Loans are stored as positive
    debt amounts and returned negative so they subtract correctly from net
    worth (matches the old assets model). Credit — money owed to you, the
    mirror of a loan — keeps the default positive sign, same as any asset.
    """
    if not valuations:
        return {"current_value": 0.0, "first_value": 0.0, "gain": 0.0, "history": []}

    ordered = sorted(valuations, key=lambda v: v.valuation_date)
    first_value = ordered[0].value
    current_value = ordered[-1].value
    sign = -1 if holding.asset_type == "loan" else 1

    return {
        "current_value": current_value * sign,
        "first_value": first_value * sign,
        "gain": (current_value - first_value) * sign,
        "history": [
            {"date": v.valuation_date.isoformat(), "value": v.value * sign, "notes": v.notes}
            for v in ordered
        ],
    }


def build_funding_valuation(
    source_holding: Holding,
    existing_valuations: List[HoldingValuation],
    amount: float,
    amount_currency: str,
    on_date: date,
    acting_user_id,
) -> HoldingValuation:
    """
    Build (uncommitted) the valuation entry that records spending money out
    of a cash holding to fund a purchase elsewhere — e.g. paying for a gold
    purchase out of a bank account. Restricted to "cash" specifically (not
    valuation-based holdings generally): reducing a real_estate/loan/retiral
    valuation the same way wouldn't mean "money was spent from it", so
    letting those through would produce a number that looks like a data
    point but means something else.
    """
    if source_holding.asset_type != "cash":
        raise ValueError("Funding source must be a cash holding")
    if not existing_valuations:
        raise ValueError("This cash holding has no recorded balance yet")

    latest = max(existing_valuations, key=lambda v: v.valuation_date)
    converted_amount = price_service.convert(amount, amount_currency, source_holding.currency)

    return HoldingValuation(
        holding_id=source_holding.id,
        user_id=acting_user_id,
        valuation_date=on_date,
        value=latest.value - converted_amount,
        currency=source_holding.currency,
        notes="Used to fund a purchase",
    )


def get_holding_metrics(
    holding: Holding,
    transactions: Optional[List[HoldingTransaction]] = None,
    valuations: Optional[List[HoldingValuation]] = None,
    current_price: Optional[float] = None,
) -> Dict:
    """Dispatches to the right metric calculation based on asset_type."""
    if holding.asset_type in QUANTITY_BASED_TYPES:
        return calculate_holding_metrics(holding, transactions or [], current_price=current_price)
    return calculate_valuation_metrics(holding, valuations or [])


def portfolio_xirr(all_transactions: List[HoldingTransaction], total_current_value: float) -> Optional[float]:
    """
    Portfolio-wide XIRR across every buy/sell transaction for all quantity-based
    holdings, treating the sum of their current values as one final cash flow
    today. Scoped to tradeable holdings — XIRR isn't a meaningful metric for
    cash balances or loans, which don't have purchase/sale cash flows.
    """
    cash_flows = _transaction_cash_flows(all_transactions)
    if total_current_value > 0:
        cash_flows.append((date.today(), total_current_value))
    return xirr(cash_flows)


def list_holdings_with_metrics(holdings: List[Holding], display_currency: str = "USD") -> List[Dict]:
    """
    Attach live-priced metrics to each holding (in its native currency) plus
    a display_value converted to display_currency. Fetches each unique
    (asset_type, symbol) price only once even if several holdings share it,
    to avoid redundant external API calls when listing a whole portfolio.

    The price fetches themselves run in parallel (get_current_price is pure
    network I/O against an in-memory cache — no DB access, so this is safe
    without touching Flask's app/request context) rather than one at a time:
    a portfolio with several holdings whose prices aren't warm in the 5-min
    in-memory cache was previously waiting on N sequential external calls in
    a row, which is the single biggest source of a slow dashboard/portfolio
    load, especially when NSE's flaky fallback chain has to fail through a
    couple of sources per symbol before landing on Yahoo.
    """
    quantity_keys = list({(h.asset_type, h.symbol, h.currency) for h in holdings if h.asset_type in QUANTITY_BASED_TYPES})

    price_cache: Dict[tuple, Optional[float]] = {}
    if quantity_keys:
        with ThreadPoolExecutor(max_workers=min(8, len(quantity_keys))) as pool:
            fetched = pool.map(lambda k: price_service.get_current_price(k[0], k[1], k[2]), quantity_keys)
        price_cache = dict(zip(((k[0], k[1]) for k in quantity_keys), fetched))

    results = []
    for h in holdings:
        if h.asset_type in QUANTITY_BASED_TYPES:
            transactions = HoldingTransaction.query.filter_by(holding_id=h.id).all()
            metrics = calculate_holding_metrics(h, transactions, current_price=price_cache.get((h.asset_type, h.symbol)))
        else:
            valuations = HoldingValuation.query.filter_by(holding_id=h.id).all()
            metrics = calculate_valuation_metrics(h, valuations)

        metrics["display_value"] = price_service.convert(metrics["current_value"], h.currency, display_currency)
        if metrics.get("income_received") is not None:
            metrics["display_income_received"] = price_service.convert(metrics["income_received"], h.currency, display_currency)
        # realized_gain/unrealized_gain stay in the holding's own currency
        # for per-holding display (HoldingDetail shows them alongside that
        # holding's own currency symbol) — these display_* twins are for
        # portfolio-wide aggregation, where summing raw native-currency
        # figures across e.g. USD and INR holdings would silently add
        # mismatched currencies together.
        if metrics.get("realized_gain") is not None:
            metrics["display_realized_gain"] = price_service.convert(metrics["realized_gain"], h.currency, display_currency)
        if metrics.get("unrealized_gain") is not None:
            metrics["display_unrealized_gain"] = price_service.convert(metrics["unrealized_gain"], h.currency, display_currency)
        # Same reasoning as display_realized_gain/display_unrealized_gain
        # above: cost_basis (quantity-based) and first_value (valuation-
        # based) are both "what this holding was originally worth," in its
        # own currency — a converted twin lets callers sum "buy value"
        # across holdings in different currencies (e.g. an account-level or
        # portfolio-wide aggregate) without mixing currencies.
        if metrics.get("cost_basis") is not None:
            metrics["display_cost_basis"] = price_service.convert(metrics["cost_basis"], h.currency, display_currency)
        if metrics.get("first_value") is not None:
            metrics["display_first_value"] = price_service.convert(metrics["first_value"], h.currency, display_currency)
        results.append({**h.to_dict(), **metrics})

    return results


# Fields the Portfolio list view / dashboard aggregation actually use.
# Everything else (notes, institution, interest_rate, maturity_date,
# timestamps, is_private, status) is only needed on the holding detail page,
# which fetches a single holding via GET /holdings/:id — never trimmed.
SUMMARY_FIELDS = (
    "id", "household_id", "asset_type", "symbol", "name", "country", "account", "currency",
    "quantity", "avg_cost", "current_price", "current_value", "display_value",
    "realized_gain", "unrealized_gain", "display_realized_gain", "display_unrealized_gain",
    "total_gain", "xirr", "income_received", "display_income_received",
    "first_value", "gain", "cost_basis", "display_cost_basis", "display_first_value",
)


def to_summary(holding_dict: Dict) -> Dict:
    return {k: holding_dict.get(k) for k in SUMMARY_FIELDS}


def build_dashboard(
    holdings_with_metrics: List[Dict],
    holdings_by_id: Dict[int, Holding],
    display_currency: str = "USD",
    all_transactions: Optional[List[HoldingTransaction]] = None,
    total_liabilities: float = 0.0,
) -> Dict:
    """
    Aggregate metrics already computed by list_holdings_with_metrics into the
    dashboard payload: total net worth, allocation by type/country/currency,
    top gainers/losers this month, and realized vs unrealized summary.

    all_transactions (every buy/sell across the caller's quantity-based
    holdings) is optional so existing callers/tests that don't need the
    headline portfolio_xirr figure don't have to fetch and pass it.

    total_liabilities (already converted to display_currency by the caller)
    is subtracted from total assets to get true net worth. allocation_by_*
    stays asset-only — allocation is about how assets are split, not debt —
    so callers computing a percentage from it (e.g. rebalance plans) should
    divide by total_assets, not total_net_worth.
    """
    total_assets = sum(h["display_value"] for h in holdings_with_metrics)
    total_net_worth = total_assets - total_liabilities

    allocation_by_type: Dict[str, float] = {}
    allocation_by_country: Dict[str, float] = {}
    allocation_by_currency: Dict[str, float] = {}
    total_realized = 0.0
    total_unrealized = 0.0
    total_income_received = 0.0

    movers = []
    cutoff = date.today() - timedelta(days=30)

    mover_candidates = []
    for h in holdings_with_metrics:
        allocation_by_type[h["asset_type"]] = allocation_by_type.get(h["asset_type"], 0.0) + h["display_value"]
        allocation_by_country[h["country"]] = allocation_by_country.get(h["country"], 0.0) + h["display_value"]
        allocation_by_currency[h["currency"]] = allocation_by_currency.get(h["currency"], 0.0) + h["display_value"]

        if h["asset_type"] in QUANTITY_BASED_TYPES:
            total_realized += h.get("display_realized_gain") or 0.0
            total_unrealized += h.get("display_unrealized_gain") or 0.0
            total_income_received += h.get("display_income_received") or 0.0
            holding = holdings_by_id.get(h["id"])
            if holding and h.get("quantity", 0) > 0:
                mover_candidates.append(h)

    # Best-effort "this month" mover — each candidate needs its own
    # historical-price lookup (external call on any day that price isn't
    # already DB-cached), so this is capped to the largest positions by
    # value rather than run for every holding: an uncapped loop here is
    # the single biggest lever on dashboard load time for a portfolio
    # with more than a handful of holdings.
    MAX_MOVER_LOOKUPS = 15
    mover_candidates.sort(key=lambda h: h["display_value"], reverse=True)
    for h in mover_candidates[:MAX_MOVER_LOOKUPS]:
        past_price = price_service.get_historical_price(h["asset_type"], h["symbol"], cutoff, h["currency"])
        if past_price and past_price > 0 and h.get("current_price"):
            pct_change = ((h["current_price"] - past_price) / past_price) * 100.0
            movers.append({
                "id": h["id"],
                "name": h["name"],
                "symbol": h["symbol"],
                "asset_type": h["asset_type"],
                "change_pct": round(pct_change, 2),
                "current_value": h["display_value"],
            })

    movers.sort(key=lambda m: m["change_pct"], reverse=True)

    overall_xirr = None
    if all_transactions:
        tradeable_value = sum(
            h["display_value"] for h in holdings_with_metrics if h["asset_type"] in QUANTITY_BASED_TYPES
        )
        overall_xirr = portfolio_xirr(all_transactions, tradeable_value)

    return {
        "total_net_worth": round(total_net_worth, 2),
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "currency": display_currency,
        "portfolio_xirr": overall_xirr,
        "allocation_by_type": [{"label": k, "value": round(v, 2)} for k, v in allocation_by_type.items()],
        "allocation_by_country": [{"label": k, "value": round(v, 2)} for k, v in allocation_by_country.items()],
        "allocation_by_currency": [{"label": k, "value": round(v, 2)} for k, v in allocation_by_currency.items()],
        "top_gainers": movers[:5],
        "top_losers": list(reversed(movers[-5:])) if len(movers) > 5 else [],
        "realized_gain": round(total_realized, 2),
        "unrealized_gain": round(total_unrealized, 2),
        "income_received": round(total_income_received, 2),
    }


def get_monthly_net_flow(
    holdings: List[Holding],
    transactions: List[HoldingTransaction],
    valuations: List[HoldingValuation],
    display_currency: str = "USD",
    months: int = 12,
) -> List[Dict]:
    """Net cash flow per month per asset type — how much money moved into
    or out of each type that month, as distinct from the type's total
    value (see build_dashboard's allocation_by_type for that).

    For quantity-based holdings (stock/mutual_fund/crypto/commodity) this
    is real activity from the transaction ledger: a buy is a positive
    contribution, a sell a negative withdrawal.

    Valuation-based holdings have no separate ledger, so the change
    between consecutive valuation entries is used as the best available
    proxy — this necessarily blends real contributions with market
    movement (e.g., real estate appreciation looks identical to money
    actually put in), unlike the transaction-ledger types where the
    number is exact. Loans use the same sign flip as everywhere else in
    this module (paying a loan down is a positive flow; borrowing more
    is negative) so a positive number always means "net worth improved
    because of this" regardless of asset type.
    """
    holdings_by_id = {h.id: h for h in holdings}
    by_month_type: Dict[str, Dict[str, float]] = {}

    def add(month_key: str, asset_type: str, amount: float):
        bucket = by_month_type.setdefault(month_key, {})
        bucket[asset_type] = bucket.get(asset_type, 0.0) + amount

    for tx in transactions:
        holding = holdings_by_id.get(tx.holding_id)
        if not holding:
            continue
        amount = tx.quantity * tx.price_per_unit + (tx.fees or 0.0)
        amount = price_service.convert(amount, tx.currency, display_currency)
        # A sell withdraws from the position (negative); a buy contributes
        # to it, and so does dividend/interest income — both are money
        # landing in this asset type, not leaving it.
        signed = -amount if tx.transaction_type == "sell" else amount
        add(tx.transaction_date.strftime("%Y-%m"), holding.asset_type, signed)

    valuations_by_holding: Dict[int, List[HoldingValuation]] = {}
    for v in valuations:
        valuations_by_holding.setdefault(v.holding_id, []).append(v)

    for holding_id, vals in valuations_by_holding.items():
        holding = holdings_by_id.get(holding_id)
        if not holding:
            continue
        ordered = sorted(vals, key=lambda v: v.valuation_date)
        sign = -1 if holding.asset_type == "loan" else 1
        for prev, curr in zip(ordered, ordered[1:]):
            delta = price_service.convert(curr.value - prev.value, curr.currency, display_currency)
            add(curr.valuation_date.strftime("%Y-%m"), holding.asset_type, sign * delta)

    ordered_months = sorted(by_month_type.keys())[-months:]
    result = []
    for month in ordered_months:
        by_type = {k: round(v, 2) for k, v in by_month_type[month].items()}
        result.append({
            "month": month,
            "total_flow": round(sum(by_type.values()), 2),
            "by_asset_type": by_type,
        })
    return result
