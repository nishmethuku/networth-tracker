"""
Deterministic (no AI) CSV import for one fixed transaction-log format --
built to replace both the AI spreadsheet importer and the broker-specific
CSV importer for the common case: a plain CSV someone maintains themselves
of holdings/transactions across accounts. No broker selection, no AI call
(so no Gemini quota to run out, and no per-row unpredictability).

Expected columns (case-insensitive, whitespace-trimmed; a few aliases per
column are accepted -- see COLUMN_ALIASES):
  Holding Type, Holding Account, Source, Investment, Transaction,
  Transaction Date, Transaction Units, Transaction price, Currency, Country

Produces rows in the exact shape smart_import_service._validate_row /
confirm_smart_import already expect (asset_type, symbol, name, account,
source_account, transaction_type, quantity, price_per_unit, date, value,
currency, country), so parsing and writing stay two separate steps, same
as the AI path -- this module only replaces "how rows get produced",
never touches the DB itself. confirm_smart_import already auto-creates a
missing funding/source account rather than skipping it.
"""
import csv
import io
from datetime import date, datetime
from typing import Dict, Optional

VALID_ASSET_TYPES = (
    "stock", "mutual_fund", "crypto", "commodity",
    "real_estate", "fixed_deposit", "ppf", "epf", "retirals", "cash", "loan", "credit",
)
VALID_COUNTRIES = ("United States", "India", "Australia")
VALID_CURRENCIES = ("USD", "INR", "AUD")

ASSET_TYPE_ALIASES = {
    "stock": "stock", "stocks": "stock", "equity": "stock", "equities": "stock", "share": "stock", "shares": "stock",
    "mutual fund": "mutual_fund", "mutual funds": "mutual_fund", "mf": "mutual_fund", "fund": "mutual_fund",
    "crypto": "crypto", "cryptocurrency": "crypto", "cryptocurrencies": "crypto",
    "commodity": "commodity", "commodities": "commodity", "precious metal": "commodity",
    "precious metals": "commodity", "gold": "commodity", "metals": "commodity",
    "real estate": "real_estate", "realestate": "real_estate", "property": "real_estate", "properties": "real_estate",
    "fixed deposit": "fixed_deposit", "fixed deposits": "fixed_deposit", "fd": "fixed_deposit",
    "fds": "fixed_deposit", "term deposit": "fixed_deposit",
    "ppf": "ppf", "epf": "epf",
    "retirals": "retirals", "retirement": "retirals", "401k": "retirals", "ira": "retirals", "nps": "retirals",
    "cash": "cash", "bank": "cash", "bank account": "cash", "savings": "cash", "checking": "cash",
    "loan": "loan", "loans": "loan",
    "credit": "credit", "credit given": "credit", "lent": "credit",
}

# Formats tried in order -- day-first before month-first, since this is
# built for an Indian-context user base where 7/8/2020 means 7 Aug, not
# Jul 8. An unambiguous date (day > 12) parses correctly regardless of
# order; only the truly ambiguous case (both day and month <= 12) is
# affected by this ordering.
DATE_FORMATS = ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y", "%d/%m/%y", "%m/%d/%Y", "%m/%d/%y"]

COLUMN_ALIASES = {
    "asset_type": ("holding type", "asset type", "type"),
    "account": ("holding account", "account", "target account", "target ac"),
    "source_account": ("source", "source account", "src fund ac", "funding account", "funded from"),
    "investment": ("investment", "stock", "stock symbol", "symbol", "scheme name", "name"),
    "transaction_type": ("transaction", "transaction type", "trans code"),
    "date": ("transaction date", "date"),
    "quantity": ("transaction units", "units", "qty", "quantity"),
    "price_per_unit": ("transaction price", "price", "price per unit", "nav"),
    "currency": ("currency",),
    "country": ("country",),
}


def _normalize_header(name: str) -> str:
    return (name or "").strip().lower()


def _find_columns(fieldnames) -> Dict[str, Optional[str]]:
    normalized = {_normalize_header(h): h for h in (fieldnames or [])}
    found = {}
    for field, aliases in COLUMN_ALIASES.items():
        found[field] = next((normalized[a] for a in aliases if a in normalized), None)
    return found


def _parse_date(raw: str) -> Optional[date]:
    s = (raw or "").strip()
    if not s:
        return None
    s = s.split(" ")[0].split("T")[0]
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_number(raw) -> Optional[float]:
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "").replace("$", "").replace("₹", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_simple_csv(csv_text: str) -> Dict:
    """Returns {"rows": [...], "errors": [...]} -- rows are already in the
    shape confirm_smart_import expects (not yet validated/normalized by
    _validate_row, same as the AI path's parse step)."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["Empty or unreadable CSV"]}

    columns = _find_columns(reader.fieldnames)
    required = ("investment", "transaction_type", "date", "quantity", "price_per_unit")
    missing = [f for f in required if not columns[f]]
    if missing:
        return {
            "rows": [],
            "errors": [
                f"Couldn't find expected column(s): {', '.join(missing)}. "
                "Expected something like: Holding Type, Holding Account, Source, Investment, "
                "Transaction, Transaction Date, Transaction Units, Transaction price, Currency, Country."
            ],
        }

    rows = []
    errors = []
    for i, raw_row in enumerate(reader, start=2):
        try:
            def get(field):
                col = columns[field]
                return (raw_row.get(col) or "").strip() if col else ""

            asset_type_raw = get("asset_type").lower()
            asset_type = ASSET_TYPE_ALIASES.get(asset_type_raw, "stock" if not asset_type_raw else None)
            if asset_type is None or asset_type not in VALID_ASSET_TYPES:
                errors.append(f"Row {i}: unrecognized holding type '{get('asset_type')}'")
                continue

            transaction_type = get("transaction_type").lower()
            if transaction_type not in ("buy", "sell"):
                errors.append(f"Row {i}: transaction must be 'Buy' or 'Sell', got '{get('transaction_type')}'")
                continue

            transaction_date = _parse_date(get("date"))
            if not transaction_date:
                errors.append(f"Row {i}: couldn't parse date '{get('date')}'")
                continue

            investment = get("investment")
            if not investment:
                errors.append(f"Row {i}: missing investment/stock/scheme name")
                continue

            quantity = _parse_number(get("quantity"))
            price = _parse_number(get("price_per_unit"))
            if quantity is None or price is None or quantity <= 0 or price <= 0:
                errors.append(f"Row {i}: quantity and price must both be positive numbers")
                continue

            currency = get("currency").upper() or "USD"
            if currency not in VALID_CURRENCIES:
                currency = "USD"
            country = get("country") or "United States"
            if country not in VALID_COUNTRIES:
                country = "United States"

            rows.append({
                "asset_type": asset_type,
                "symbol": investment if asset_type in ("stock", "mutual_fund", "crypto", "commodity") else None,
                "name": investment,
                "account": get("account"),
                "source_account": get("source_account") or None,
                "transaction_type": transaction_type,
                "date": transaction_date.isoformat(),
                "quantity": quantity,
                "price_per_unit": price,
                "value": round(quantity * price, 2),
                "currency": currency,
                "country": country,
            })
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return {"rows": rows, "errors": errors}
