"""
Rebuild a user's past net worth, one snapshot per month, from recorded
transactions plus historical prices and exchange rates. Shared by the
"Rebuild history" button (POST /net-worth-history/rebuild) and the
command-line script (scripts/backfill_net_worth_history.py).

Safe by design: a preview (apply=False) writes nothing, existing snapshots
are never overwritten, a date that cannot be fully priced is skipped, and a
user with liabilities is refused (past debt balances are not reconstructed,
so the totals would be overstated).
"""
import time
from datetime import date
from typing import Optional

from . import price_service
from .history_backfill import HoldingRecord, earliest_activity, month_starts, reconstruct_series
from .models import Holding, HoldingTransaction, HoldingValuation, Liability, NetWorthSnapshot, db

# A web request must finish well inside the server timeout, so look at most
# this many of the most recent missing months and stop pricing after a budget.
MAX_MONTHS_PER_RUN = 24
TIME_BUDGET_SECONDS = 20.0


def default_price_fn(asset_type, symbol, on_date):
    # Stocks/funds are priced in their home exchange's currency; crypto and
    # commodities are requested in USD directly (see price_service).
    home = price_service.price_home_currency(asset_type, symbol)
    price_currency = home or "USD"
    price = price_service.get_historical_price(asset_type, symbol, on_date, currency=price_currency)
    return (price, price_currency) if price is not None else None


def default_rate_fn(from_currency, to_currency, on_date):
    return price_service.get_rate(from_currency, to_currency, on_date)


def load_records(user_id):
    holdings = Holding.query.filter(Holding.user_id == user_id, Holding.deleted_at.is_(None)).all()
    records = []
    for h in holdings:
        txs = HoldingTransaction.query.filter(
            HoldingTransaction.holding_id == h.id, HoldingTransaction.deleted_at.is_(None)
        ).all()
        vals = HoldingValuation.query.filter(HoldingValuation.holding_id == h.id).all()
        records.append(
            HoldingRecord(
                asset_type=h.asset_type,
                symbol=h.symbol,
                currency=h.currency,
                transactions=[(t.transaction_date, t.transaction_type, t.quantity) for t in txs],
                valuations=[(v.valuation_date, v.value, v.currency) for v in vals],
            )
        )
    return records


def rebuild_history(user_id, apply: bool = False, today: Optional[date] = None, price_fn=None, rate_fn=None):
    """Returns a dict with "status" and details.

    status is one of: "has_liabilities", "nothing_recorded", "up_to_date",
    "preview" (nothing written) or "saved".
    """
    today = today or date.today()
    price_fn = price_fn or default_price_fn
    rate_fn = rate_fn or default_rate_fn

    if Liability.query.filter(Liability.user_id == user_id).count() > 0:
        return {"status": "has_liabilities"}

    records = load_records(user_id)
    first = earliest_activity(records)
    if first is None:
        return {"status": "nothing_recorded"}

    existing = {s.snapshot_date for s in NetWorthSnapshot.query.filter(NetWorthSnapshot.user_id == user_id).all()}
    missing = [d for d in month_starts(first, today) if d not in existing]
    if not missing:
        return {"status": "up_to_date", "first_activity": first.isoformat()}

    truncated = len(missing) > MAX_MONTHS_PER_RUN
    dates = missing[-MAX_MONTHS_PER_RUN:]

    # Price one month at a time so a slow price source cannot hang the request.
    started = time.monotonic()
    series = []
    timed_out = False
    for d in dates:
        if time.monotonic() - started > TIME_BUDGET_SECONDS:
            timed_out = True
            break
        series.extend(reconstruct_series(records, [d], price_fn, rate_fn, "USD"))

    to_write = [row for row in series if "total" in row]
    skipped = [row for row in series if "skipped" in row]

    if apply:
        for row in to_write:
            by_type = row["by_asset_type"]
            db.session.add(
                NetWorthSnapshot(
                    user_id=user_id,
                    snapshot_date=row["date"],
                    total_net_worth=row["total"],
                    total_stock_value=round(by_type.get("stock", 0.0) + by_type.get("mutual_fund", 0.0), 2),
                    total_property_value=round(by_type.get("real_estate", 0.0), 2),
                    total_profit_loss=0.0,
                    total_liabilities=0.0,
                    by_asset_type=by_type,
                    currency="USD",
                )
            )
        db.session.commit()

    return {
        "status": "saved" if apply else "preview",
        "first_activity": first.isoformat(),
        "months": [{"date": r["date"].isoformat(), "total": r["total"]} for r in to_write],
        "skipped": [{"date": r["date"].isoformat(), "reasons": r["skipped"]} for r in skipped],
        # More months remain (older than the window, or the time budget ran out):
        # run it again to continue.
        "more_to_do": truncated or timed_out,
    }
