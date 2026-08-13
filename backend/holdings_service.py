"""
Position and gain calculations for transaction-based holdings.

Mirrors services.py's role for the old single-row assets model, but works
off a holding's transaction ledger (quantity-based types: stock, mutual_fund,
crypto, commodity) or valuation history (everything else: real_estate,
fixed_deposit, ppf, epf, cash, loan) instead of one frozen buy price/quantity.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from . import price_service
from .finance import xirr
from .models import Holding, HoldingTransaction, HoldingValuation

QUANTITY_BASED_TYPES = ("stock", "mutual_fund", "crypto", "commodity")
VALUATION_BASED_TYPES = ("real_estate", "fixed_deposit", "ppf", "epf", "cash", "loan")


def compute_position(transactions: List[HoldingTransaction]) -> Dict:
    """
    Walk a holding's buy/sell transactions in date order using the average
    cost method: each buy updates the running average cost; each sell
    reduces quantity and books realized gain against the average cost at
    the time of sale (average cost itself doesn't change on a sell).
    """
    quantity = 0.0
    total_cost = 0.0
    realized_gain = 0.0
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

    avg_cost = (total_cost / quantity) if quantity > 0 else 0.0

    return {
        "quantity": quantity,
        "realized_events": realized_events,
        "avg_cost": avg_cost,
        "cost_basis": total_cost,
        "realized_gain": realized_gain,
    }


def _transaction_cash_flows(transactions: List[HoldingTransaction]):
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
        "xirr": xirr(cash_flows),
    }


def calculate_valuation_metrics(holding: Holding, valuations: List[HoldingValuation]) -> Dict:
    """
    Metrics for a non-tradeable holding (real_estate/fixed_deposit/ppf/epf/cash/loan):
    current value is the latest valuation entry; gain is the change since the
    first entry. Loans are stored as positive debt amounts and returned negative
    so they subtract correctly from net worth (matches the old assets model).
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
    """
    price_cache: Dict[tuple, Optional[float]] = {}
    results = []

    for h in holdings:
        if h.asset_type in QUANTITY_BASED_TYPES:
            transactions = HoldingTransaction.query.filter_by(holding_id=h.id).all()
            price_key = (h.asset_type, h.symbol)
            if price_key not in price_cache:
                price_cache[price_key] = price_service.get_current_price(h.asset_type, h.symbol, h.currency)
            metrics = calculate_holding_metrics(h, transactions, current_price=price_cache[price_key])
        else:
            valuations = HoldingValuation.query.filter_by(holding_id=h.id).all()
            metrics = calculate_valuation_metrics(h, valuations)

        metrics["display_value"] = price_service.convert(metrics["current_value"], h.currency, display_currency)
        results.append({**h.to_dict(), **metrics})

    return results


# Fields the Portfolio list view / dashboard aggregation actually use.
# Everything else (notes, institution, interest_rate, maturity_date,
# timestamps, is_private, status) is only needed on the holding detail page,
# which fetches a single holding via GET /holdings/:id — never trimmed.
SUMMARY_FIELDS = (
    "id", "household_id", "asset_type", "symbol", "name", "country", "account", "currency",
    "quantity", "avg_cost", "current_price", "current_value", "display_value",
    "realized_gain", "unrealized_gain", "total_gain", "xirr",
    "first_value", "gain", "cost_basis",
)


def to_summary(holding_dict: Dict) -> Dict:
    return {k: holding_dict.get(k) for k in SUMMARY_FIELDS}


def build_dashboard(holdings_with_metrics: List[Dict], holdings_by_id: Dict[int, Holding], display_currency: str = "USD") -> Dict:
    """
    Aggregate metrics already computed by list_holdings_with_metrics into the
    dashboard payload: total net worth, allocation by type/country, top
    gainers/losers this month, and realized vs unrealized summary.
    """
    total_net_worth = sum(h["display_value"] for h in holdings_with_metrics)

    allocation_by_type: Dict[str, float] = {}
    allocation_by_country: Dict[str, float] = {}
    total_realized = 0.0
    total_unrealized = 0.0

    movers = []
    cutoff = date.today() - timedelta(days=30)

    for h in holdings_with_metrics:
        allocation_by_type[h["asset_type"]] = allocation_by_type.get(h["asset_type"], 0.0) + h["display_value"]
        allocation_by_country[h["country"]] = allocation_by_country.get(h["country"], 0.0) + h["display_value"]

        if h["asset_type"] in QUANTITY_BASED_TYPES:
            total_realized += h.get("realized_gain", 0.0)
            total_unrealized += h.get("unrealized_gain", 0.0)

            # Best-effort "this month" mover — only for symbols with a
            # historical price available (crypto, Indian mutual funds).
            holding = holdings_by_id.get(h["id"])
            if holding and h.get("quantity", 0) > 0:
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

    return {
        "total_net_worth": round(total_net_worth, 2),
        "currency": display_currency,
        "allocation_by_type": [{"label": k, "value": round(v, 2)} for k, v in allocation_by_type.items()],
        "allocation_by_country": [{"label": k, "value": round(v, 2)} for k, v in allocation_by_country.items()],
        "top_gainers": movers[:5],
        "top_losers": list(reversed(movers[-5:])) if len(movers) > 5 else [],
        "realized_gain": round(total_realized, 2),
        "unrealized_gain": round(total_unrealized, 2),
    }
