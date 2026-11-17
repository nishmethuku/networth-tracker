"""
Remittances: a log of money sent to family or a person abroad, for example
USD sent and INR received. It never changes a balance. What it adds is the
numbers people actually ask about: the rate they really got, the fees paid,
and how much went out this year and each month.

amount_sent is the total that left the sender's account, fee included, so the
effective rate is amount_received / amount_sent.
"""
from collections import defaultdict
from datetime import date
from typing import Dict, List, Optional

from .models import Remittance, db

CURRENCIES = ("USD", "INR", "AUD", "GBP", "EUR", "CAD")


def _money(value, label: str, allow_zero: bool = False) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a number")
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{label} must be a number")
    if number < 0 or (number == 0 and not allow_zero):
        raise ValueError(f"{label} must be greater than 0")
    return number


def clean(data: Dict, existing: Optional[Remittance] = None) -> Dict:
    def pick(key, default=None):
        if key in data:
            return data[key]
        return getattr(existing, key, default) if existing is not None else default

    try:
        raw_date = pick("sent_date")
        sent_date = raw_date if isinstance(raw_date, date) else (date.fromisoformat(raw_date) if raw_date else date.today())
    except (TypeError, ValueError):
        raise ValueError("sent_date must be YYYY-MM-DD")
    if sent_date > date.today():
        raise ValueError("sent_date can't be in the future")

    recipient = (pick("recipient") or "").strip()
    if not recipient:
        raise ValueError("Who did you send it to? Enter a name like Mom.")
    currency_sent = (pick("currency_sent") or "").upper()
    currency_received = (pick("currency_received") or "").upper()
    for label, cur in (("Currency sent", currency_sent), ("Currency received", currency_received)):
        if cur not in CURRENCIES:
            raise ValueError(f"{label} must be one of {', '.join(CURRENCIES)}")

    amount_sent = _money(pick("amount_sent"), "Amount sent")
    amount_received = _money(pick("amount_received"), "Amount received")
    fee = _money(pick("fee", 0) or 0, "Fee", allow_zero=True)
    if fee >= amount_sent:
        raise ValueError("The fee has to be less than the amount sent")

    return {
        "sent_date": sent_date,
        "recipient": recipient[:80],
        "provider": (pick("provider") or "").strip()[:60] or None,
        "amount_sent": amount_sent,
        "currency_sent": currency_sent,
        "amount_received": amount_received,
        "currency_received": currency_received,
        "fee": fee,
        "note": (pick("note") or "").strip()[:200] or None,
    }


def list_remittances(user_id, limit: int = 1000) -> List[Dict]:
    rows = (
        Remittance.query.filter_by(user_id=user_id)
        .order_by(Remittance.sent_date.desc(), Remittance.id.desc())
        .limit(limit)
        .all()
    )
    return [r.to_dict() for r in rows]


def create_remittance(user_id, data: Dict) -> Dict:
    row = Remittance(user_id=user_id, **clean(data))
    db.session.add(row)
    db.session.commit()
    return row.to_dict()


def update_remittance(remittance_id, user_id, data: Dict) -> Optional[Dict]:
    row = Remittance.query.filter_by(id=remittance_id, user_id=user_id).first()
    if row is None:
        return None
    for key, value in clean(data, row).items():
        setattr(row, key, value)
    db.session.commit()
    return row.to_dict()


def delete_remittance(remittance_id, user_id) -> bool:
    row = Remittance.query.filter_by(id=remittance_id, user_id=user_id).first()
    if row is None:
        return False
    db.session.delete(row)
    db.session.commit()
    return True


def _month_keys(today: date, count: int = 12) -> List[str]:
    keys = []
    year, month = today.year, today.month
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(keys))


def summarize(items: List[Dict], today: Optional[date] = None) -> List[Dict]:
    """One summary per currency pair (USD to INR is not mixed with GBP to INR).
    Pure: takes the dicts list_remittances returns."""
    today = today or date.today()
    months = _month_keys(today)
    groups: Dict[tuple, List[Dict]] = defaultdict(list)
    for item in items:
        groups[(item["currency_sent"], item["currency_received"])].append(item)

    out = []
    for (cur_sent, cur_received), rows in groups.items():
        total_sent = sum(r["amount_sent"] for r in rows)
        total_received = sum(r["amount_received"] for r in rows)
        total_fees = sum(r["fee"] or 0 for r in rows)
        rates = [r["effective_rate"] for r in rows if r["effective_rate"]]
        newest = max(rows, key=lambda r: (r["sent_date"], r["id"]))
        year_rows = [r for r in rows if r["sent_date"].startswith(str(today.year))]
        by_month = {m: 0.0 for m in months}
        by_recipient: Dict[str, float] = defaultdict(float)
        for r in rows:
            by_recipient[r["recipient"]] += r["amount_sent"]
            key = r["sent_date"][:7]
            if key in by_month:
                by_month[key] += r["amount_sent"]
        out.append({
            "currency_sent": cur_sent,
            "currency_received": cur_received,
            "count": len(rows),
            "total_sent": round(total_sent, 2),
            "total_received": round(total_received, 2),
            "total_fees": round(total_fees, 2),
            "fee_percent": round(total_fees / total_sent * 100, 2) if total_sent else 0,
            "average_rate": round(total_received / total_sent, 4) if total_sent else None,
            "best_rate": max(rates) if rates else None,
            "worst_rate": min(rates) if rates else None,
            "latest_rate": newest["effective_rate"],
            "year": today.year,
            "year_sent": round(sum(r["amount_sent"] for r in year_rows), 2),
            "year_received": round(sum(r["amount_received"] for r in year_rows), 2),
            "months": [{"month": m, "sent": round(by_month[m], 2)} for m in months],
            "recipients": sorted(
                ({"recipient": name, "sent": round(v, 2)} for name, v in by_recipient.items()),
                key=lambda x: -x["sent"],
            ),
        })
    out.sort(key=lambda g: -g["total_sent"])
    return out
