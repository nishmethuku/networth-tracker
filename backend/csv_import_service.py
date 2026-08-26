"""
Broker CSV import: parses each broker's transaction export into a common
row format for preview before anything touches the database.

Built against each broker's documented/typical export column layout, not a
live sample file — treat your first real export per broker as the
acceptance test (see the migration plan's risk note). Column matching is
case-insensitive and whitespace-trimmed; unrecognized columns produce a
clear "couldn't find column X" error instead of a silent misparse, and
unsupported row types (dividends, fees, splits) come back as explicit
skips with a reason, never silently dropped.
"""
import csv
import io
from datetime import date, datetime
from typing import Dict, List, Optional

from .models import Holding, HoldingTransaction, db

SUPPORTED_BROKERS = ["zerodha", "groww", "fidelity", "robinhood"]

DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%y"]


def _clean_number(raw) -> float:
    if raw is None:
        return 0.0
    s = str(raw).strip()
    if not s:
        return 0.0
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace("$", "").replace("₹", "").replace(",", "").strip()
    try:
        value = float(s)
    except ValueError:
        return 0.0
    return -value if negative else value


def _parse_date(raw: str) -> Optional[date]:
    s = (raw or "").strip()
    if not s:
        return None
    # Some exports include a time component — take the date part only
    s = s.split(" ")[0].split("T")[0]
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _normalized_columns(fieldnames) -> Dict[str, str]:
    return {h.strip().lower(): h for h in (fieldnames or [])}


def _find_col(normalized: Dict[str, str], *candidates) -> Optional[str]:
    for c in candidates:
        if c in normalized:
            return normalized[c]
    return None


def _missing_columns_error(required: List[tuple]) -> Optional[str]:
    missing = [name for name, col in required if not col]
    if missing:
        return f"Couldn't find expected column(s): {', '.join(missing)}. Is this the right export file?"
    return None


# ---------------------------------------------------------------------------
# Zerodha — Console tradebook export
# Columns: symbol, isin, trade_date, exchange, segment, series, trade_type,
#          auction, quantity, price, trade_id, order_id, order_execution_time
# ---------------------------------------------------------------------------
def parse_zerodha(csv_text: str) -> Dict:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["Empty or unreadable CSV"]}

    normalized = _normalized_columns(reader.fieldnames)
    symbol_col = _find_col(normalized, "symbol", "tradingsymbol")
    date_col = _find_col(normalized, "trade_date", "date")
    type_col = _find_col(normalized, "trade_type", "type")
    qty_col = _find_col(normalized, "quantity", "qty")
    price_col = _find_col(normalized, "price")

    err = _missing_columns_error([
        ("symbol", symbol_col), ("trade_date", date_col), ("trade_type", type_col),
        ("quantity", qty_col), ("price", price_col),
    ])
    if err:
        return {"rows": [], "errors": [err]}

    rows, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            trade_type = (row.get(type_col) or "").strip().lower()
            if trade_type not in ("buy", "sell"):
                rows.append({"row": i, "skipped": True, "reason": f"Unrecognized trade_type '{trade_type}'"})
                continue
            symbol = (row.get(symbol_col) or "").strip().upper()
            trade_date = _parse_date(row.get(date_col))
            quantity = _clean_number(row.get(qty_col))
            price = _clean_number(row.get(price_col))
            if not symbol or quantity <= 0 or price < 0 or not trade_date:
                rows.append({"row": i, "skipped": True, "reason": "Missing or invalid required field"})
                continue
            rows.append({
                "row": i, "skipped": False,
                "symbol": f"{symbol}.NS", "name": symbol, "asset_type": "stock",
                "transaction_type": trade_type, "transaction_date": trade_date.isoformat(),
                "quantity": quantity, "price_per_unit": price, "fees": 0.0, "currency": "INR",
                "country": "India", "account": "Zerodha",
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")
    return {"rows": rows, "errors": errors}


# ---------------------------------------------------------------------------
# Groww — two export types: stock/ETF transactions, or mutual fund statement.
# Detected by which columns are present.
# ---------------------------------------------------------------------------
def parse_groww(csv_text: str) -> Dict:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["Empty or unreadable CSV"]}
    normalized = _normalized_columns(reader.fieldnames)

    if "scheme name" in normalized or "folio no" in normalized:
        return _parse_groww_mutual_funds(csv_text, normalized)
    return _parse_groww_stocks(csv_text, normalized)


def _parse_groww_stocks(csv_text: str, normalized: Dict[str, str]) -> Dict:
    symbol_col = _find_col(normalized, "stock name", "symbol", "tradingsymbol")
    date_col = _find_col(normalized, "trade date", "date")
    type_col = _find_col(normalized, "trade type", "type")
    qty_col = _find_col(normalized, "quantity", "qty")
    price_col = _find_col(normalized, "price")

    err = _missing_columns_error([
        ("stock name", symbol_col), ("trade date", date_col), ("trade type", type_col),
        ("quantity", qty_col), ("price", price_col),
    ])
    if err:
        return {"rows": [], "errors": [err]}

    reader = csv.DictReader(io.StringIO(csv_text))
    rows, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            trade_type = (row.get(type_col) or "").strip().lower()
            if trade_type not in ("buy", "sell"):
                rows.append({"row": i, "skipped": True, "reason": f"Unrecognized trade type '{trade_type}'"})
                continue
            symbol = (row.get(symbol_col) or "").strip().upper()
            trade_date = _parse_date(row.get(date_col))
            quantity = _clean_number(row.get(qty_col))
            price = _clean_number(row.get(price_col))
            if not symbol or quantity <= 0 or price < 0 or not trade_date:
                rows.append({"row": i, "skipped": True, "reason": "Missing or invalid required field"})
                continue
            rows.append({
                "row": i, "skipped": False,
                "symbol": f"{symbol}.NS", "name": symbol, "asset_type": "stock",
                "transaction_type": trade_type, "transaction_date": trade_date.isoformat(),
                "quantity": quantity, "price_per_unit": price, "fees": 0.0, "currency": "INR",
                "country": "India", "account": "Groww",
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")
    return {"rows": rows, "errors": errors}


def _parse_groww_mutual_funds(csv_text: str, normalized: Dict[str, str]) -> Dict:
    scheme_col = _find_col(normalized, "scheme name")
    date_col = _find_col(normalized, "transaction date", "date")
    type_col = _find_col(normalized, "transaction type", "type")
    units_col = _find_col(normalized, "units")
    nav_col = _find_col(normalized, "nav")

    err = _missing_columns_error([
        ("scheme name", scheme_col), ("transaction date", date_col), ("transaction type", type_col),
        ("units", units_col), ("nav", nav_col),
    ])
    if err:
        return {"rows": [], "errors": [err]}

    reader = csv.DictReader(io.StringIO(csv_text))
    rows, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            raw_type = (row.get(type_col) or "").strip().lower()
            if "purchase" in raw_type or "sip" in raw_type:
                trade_type = "buy"
            elif "redemption" in raw_type or "redeem" in raw_type:
                trade_type = "sell"
            else:
                rows.append({"row": i, "skipped": True, "reason": f"Unrecognized transaction type '{raw_type}'"})
                continue
            scheme = (row.get(scheme_col) or "").strip()
            trade_date = _parse_date(row.get(date_col))
            units = _clean_number(row.get(units_col))
            nav = _clean_number(row.get(nav_col))
            if not scheme or units <= 0 or nav < 0 or not trade_date:
                rows.append({"row": i, "skipped": True, "reason": "Missing or invalid required field"})
                continue
            rows.append({
                "row": i, "skipped": False,
                "symbol": scheme, "name": scheme, "asset_type": "mutual_fund",
                "transaction_type": trade_type, "transaction_date": trade_date.isoformat(),
                "quantity": units, "price_per_unit": nav, "fees": 0.0, "currency": "INR",
                "country": "India", "account": "Groww",
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")
    return {"rows": rows, "errors": errors}


# ---------------------------------------------------------------------------
# Fidelity — Accounts_History.csv export
# Columns: Run Date, Account, Action, Symbol, Description, Type, Quantity,
#          Price ($), Commission ($), Fees ($), Amount ($), Settlement Date
# Action text contains e.g. "YOU BOUGHT ..." / "YOU SOLD ..."
# ---------------------------------------------------------------------------
def parse_fidelity(csv_text: str) -> Dict:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["Empty or unreadable CSV"]}
    normalized = _normalized_columns(reader.fieldnames)

    date_col = _find_col(normalized, "run date", "date")
    action_col = _find_col(normalized, "action")
    symbol_col = _find_col(normalized, "symbol")
    qty_col = _find_col(normalized, "quantity")
    price_col = _find_col(normalized, "price ($)", "price")
    fees_col = _find_col(normalized, "commission ($)", "commission")

    err = _missing_columns_error([
        ("run date", date_col), ("action", action_col), ("symbol", symbol_col),
        ("quantity", qty_col), ("price", price_col),
    ])
    if err:
        return {"rows": [], "errors": [err]}

    rows, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            action = (row.get(action_col) or "").strip().upper()
            if "BOUGHT" in action:
                trade_type = "buy"
            elif "SOLD" in action:
                trade_type = "sell"
            else:
                rows.append({"row": i, "skipped": True, "reason": f"Unsupported action '{action[:40]}'"})
                continue
            symbol = (row.get(symbol_col) or "").strip().upper()
            trade_date = _parse_date(row.get(date_col))
            quantity = abs(_clean_number(row.get(qty_col)))
            price = abs(_clean_number(row.get(price_col)))
            fees = abs(_clean_number(row.get(fees_col))) if fees_col else 0.0
            if not symbol or quantity <= 0 or price < 0 or not trade_date:
                rows.append({"row": i, "skipped": True, "reason": "Missing or invalid required field"})
                continue
            rows.append({
                "row": i, "skipped": False,
                "symbol": symbol, "name": symbol, "asset_type": "stock",
                "transaction_type": trade_type, "transaction_date": trade_date.isoformat(),
                "quantity": quantity, "price_per_unit": price, "fees": fees, "currency": "USD",
                "country": "United States", "account": "Fidelity",
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")
    return {"rows": rows, "errors": errors}


# ---------------------------------------------------------------------------
# Robinhood — account history export
# Columns: Activity Date, Process Date, Settle Date, Instrument, Description,
#          Trans Code, Quantity, Price, Amount
# ---------------------------------------------------------------------------
def parse_robinhood(csv_text: str) -> Dict:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["Empty or unreadable CSV"]}
    normalized = _normalized_columns(reader.fieldnames)

    date_col = _find_col(normalized, "activity date", "date")
    symbol_col = _find_col(normalized, "instrument", "symbol")
    code_col = _find_col(normalized, "trans code", "transcode")
    qty_col = _find_col(normalized, "quantity")
    price_col = _find_col(normalized, "price")

    err = _missing_columns_error([
        ("activity date", date_col), ("instrument", symbol_col), ("trans code", code_col),
        ("quantity", qty_col), ("price", price_col),
    ])
    if err:
        return {"rows": [], "errors": [err]}

    rows, errors = [], []
    for i, row in enumerate(reader, start=2):
        try:
            code = (row.get(code_col) or "").strip().lower()
            if code == "buy":
                trade_type = "buy"
            elif code == "sell":
                trade_type = "sell"
            else:
                rows.append({"row": i, "skipped": True, "reason": f"Unsupported trans code '{code}'"})
                continue
            symbol = (row.get(symbol_col) or "").strip().upper()
            trade_date = _parse_date(row.get(date_col))
            quantity = abs(_clean_number(row.get(qty_col)))
            price = abs(_clean_number(row.get(price_col)))
            if not symbol or quantity <= 0 or price < 0 or not trade_date:
                rows.append({"row": i, "skipped": True, "reason": "Missing or invalid required field"})
                continue
            rows.append({
                "row": i, "skipped": False,
                "symbol": symbol, "name": symbol, "asset_type": "stock",
                "transaction_type": trade_type, "transaction_date": trade_date.isoformat(),
                "quantity": quantity, "price_per_unit": price, "fees": 0.0, "currency": "USD",
                "country": "United States", "account": "Robinhood",
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")
    return {"rows": rows, "errors": errors}


PARSERS = {
    "zerodha": parse_zerodha,
    "groww": parse_groww,
    "fidelity": parse_fidelity,
    "robinhood": parse_robinhood,
}


def parse_csv(broker: str, csv_text: str) -> Dict:
    if broker not in PARSERS:
        return {"rows": [], "errors": [f"Unsupported broker '{broker}'. Supported: {', '.join(SUPPORTED_BROKERS)}"]}
    return PARSERS[broker](csv_text)


def confirm_import(user_id, rows: List[Dict], household_id=None) -> Dict:
    """Creates (or reuses) a Holding per unique (symbol, account) and adds
    one HoldingTransaction per row. All-or-nothing within one DB transaction."""
    holdings_created = 0
    transactions_created = 0
    holding_cache: Dict[tuple, Holding] = {}

    for r in rows:
        key = (r["symbol"], r["account"])
        holding = holding_cache.get(key)
        if not holding:
            holding = Holding.query.filter_by(
                user_id=user_id, symbol=r["symbol"], account=r["account"], asset_type=r["asset_type"]
            ).first()
        if not holding:
            holding = Holding(
                user_id=user_id, household_id=household_id,
                asset_type=r["asset_type"], symbol=r["symbol"], name=r["name"],
                country=r["country"], account=r["account"], currency=r["currency"],
            )
            db.session.add(holding)
            db.session.flush()
            holdings_created += 1
        holding_cache[key] = holding

        db.session.add(HoldingTransaction(
            holding_id=holding.id, user_id=user_id,
            transaction_type=r["transaction_type"],
            transaction_date=date.fromisoformat(r["transaction_date"]),
            quantity=r["quantity"], price_per_unit=r["price_per_unit"],
            fees=r.get("fees", 0.0), currency=r["currency"],
        ))
        transactions_created += 1

    db.session.commit()
    return {"holdings_created": holdings_created, "transactions_created": transactions_created}
