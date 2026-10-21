"""
Dividend and interest income summary.

Dividend/interest transactions are already recorded and counted in each
holding's metrics; this module groups them by year, month and holding so the
Income page can show what the portfolio has actually paid out, plus a simple
trailing-12-month yield. Pure grouping logic (`summarize_income`) is kept
separate from the database wrapper so it can be tested without a database.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from . import price_service
from .holdings_service import INCOME_TRANSACTION_TYPES, list_holdings_with_metrics
from .models import Holding, HoldingTransaction


def _months_back(today: date, n: int) -> str:
    """'YYYY-MM' key for the month n months before today's month."""
    index = today.year * 12 + (today.month - 1) - n
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def summarize_income(
    events: List[Dict],
    current_values: Dict[int, float],
    today: Optional[date] = None,
) -> Dict:
    """events: dicts with date (date), amount (already in the display
    currency, fees taken out), holding_id, name, symbol, type
    ('dividend'|'interest'). current_values: holding_id -> current value in
    the display currency.

    Yield is trailing-12-month income divided by the current value of the
    holdings that paid it. A holding that has since been sold has no current
    value, so its income counts toward totals but not toward the yield."""
    today = today or date.today()
    year_ago = today - timedelta(days=365)

    by_year: Dict[int, float] = {}
    by_month: Dict[str, float] = {}
    by_holding: Dict[int, Dict] = {}
    total = 0.0
    last_12 = 0.0
    last_12_holdings = set()

    for e in events:
        amount = e["amount"]
        total += amount
        by_year[e["date"].year] = by_year.get(e["date"].year, 0.0) + amount
        key = f"{e['date'].year:04d}-{e['date'].month:02d}"
        by_month[key] = by_month.get(key, 0.0) + amount
        row = by_holding.setdefault(
            e["holding_id"],
            {"holding_id": e["holding_id"], "name": e["name"], "symbol": e["symbol"], "total": 0.0, "last_12_months": 0.0},
        )
        row["total"] += amount
        if year_ago < e["date"] <= today:
            last_12 += amount
            row["last_12_months"] += amount
            last_12_holdings.add(e["holding_id"])

    base_value = sum(current_values.get(hid, 0.0) for hid in last_12_holdings)
    yield_pct = (last_12 / base_value * 100) if base_value > 0 else None

    # Always return the last 12 calendar months (including empty ones) so the
    # chart has a steady axis instead of skipping quiet months.
    months = [{"month": k, "amount": by_month.get(k, 0.0)} for k in (_months_back(today, n) for n in range(11, -1, -1))]

    return {
        "total": total,
        "last_12_months": last_12,
        "yield_pct": yield_pct,
        "by_year": [{"year": y, "amount": by_year[y]} for y in sorted(by_year, reverse=True)],
        "by_month": months,
        "by_holding": sorted(by_holding.values(), key=lambda r: r["total"], reverse=True),
        "count": len(events),
    }


def get_income_summary(user_id=None, household_id=None, display_currency: str = "USD") -> Dict:
    if household_id:
        query = Holding.query.filter_by(household_id=household_id, is_private=False)
    else:
        query = Holding.query.filter_by(user_id=user_id)
    holdings = query.filter(Holding.deleted_at.is_(None)).all()
    by_id = {h.id: h for h in holdings}
    if not by_id:
        return summarize_income([], {})

    transactions = (
        HoldingTransaction.query.filter(HoldingTransaction.holding_id.in_(list(by_id)))
        .filter(HoldingTransaction.deleted_at.is_(None))
        .filter(HoldingTransaction.transaction_type.in_(INCOME_TRANSACTION_TYPES))
        .all()
    )
    events = []
    for t in transactions:
        h = by_id[t.holding_id]
        amount = t.quantity * t.price_per_unit - (t.fees or 0.0)
        events.append(
            {
                "date": t.transaction_date,
                "amount": price_service.convert(amount, t.currency, display_currency),
                "holding_id": h.id,
                "name": h.name,
                "symbol": getattr(h, "symbol", None),
                "type": t.transaction_type,
            }
        )
    metrics = list_holdings_with_metrics(holdings, display_currency=display_currency)
    current_values = {m["id"]: m.get("display_value") or 0.0 for m in metrics}
    return summarize_income(events, current_values)
