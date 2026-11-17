"""
Deterministic (no AI) import of a broker's holdings export.

Supported files (CSV, and .xlsx where the broker offers it):
  - Zerodha Console holdings report
  - Zerodha Kite holdings download
  - Groww stocks holdings statement
  - Fidelity "Portfolio positions" download
  - Interactive Brokers activity statement (Open Positions section) and the
    Portfolio page download
  - Any other table with a symbol, a quantity and an average cost column

Nothing here touches the database. It turns the file into rows in the exact
shape smart_import_service.confirm_smart_import already accepts (one "buy"
transaction per holding, at the average cost), so the existing confirm route
does the writing and merges into a holding that already exists.

A holdings export has no purchase dates, only the position and its average
cost, so every row is dated with the date the caller gives (today by default).
"""
import csv
import io
import re
from datetime import date
from typing import Dict, List, Optional, Set, Tuple

MAX_ROWS = 2000

BROKER_LABELS = {
    "zerodha_console": "Zerodha Console",
    "zerodha_kite": "Zerodha Kite",
    "groww": "Groww",
    "fidelity": "Fidelity",
    "ibkr_activity": "Interactive Brokers (activity statement)",
    "ibkr_portfolio": "Interactive Brokers (portfolio)",
    "generic": "Generic table",
}

# What each broker's rows are denominated in. IBKR and generic files carry a
# currency column (or take the caller's default), so they are not listed here.
BROKER_DEFAULTS = {
    "zerodha_console": ("INR", "India"),
    "zerodha_kite": ("INR", "India"),
    "groww": ("INR", "India"),
    "fidelity": ("USD", "United States"),
}

COUNTRY_BY_CURRENCY = {"INR": "India", "AUD": "Australia"}
VALID_CURRENCIES = ("USD", "INR", "AUD", "GBP", "EUR", "CAD")

SYMBOL_ALIASES = ("symbol", "ticker", "instrument", "financial instrument", "stock name", "name", "security")
QTY_ALIASES = ("quantity", "qty", "qty.", "shares", "position", "units", "quantity available")
COST_ALIASES = (
    "average cost basis", "average price", "avg price", "avg. price", "avg cost", "avg. cost", "average cost",
    "cost price", "cost basis price", "purchase price", "price paid", "average buy price", "buy price", "cost per share",
)


def _norm(cell) -> str:
    return re.sub(r"\s+", " ", str(cell if cell is not None else "")).strip().lower()


def parse_number(raw) -> Optional[float]:
    """'$1,234.50', '(12)', '1,23,456.78', '₹ 90' -> float. '', '--', 'n/a' -> None."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.lower() in ("--", "-", "n/a", "na", "nan", "none"):
        return None
    negative = text.startswith("(") and text.endswith(")")
    cleaned = re.sub(r"[^\d.\-]", "", text)
    if cleaned in ("", "-", ".", "-."):
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return -abs(value) if negative else value


def read_grid(file_bytes: bytes, filename: str) -> List[List[str]]:
    """The file as a list of rows of strings. Raises ValueError with a message
    a person can act on."""
    lower = (filename or "").lower()
    if lower.endswith(".csv"):
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = file_bytes.decode("cp1252")
            except UnicodeDecodeError:
                raise ValueError(
                    'Couldn\'t read this file as text. Try re-saving it as "CSV UTF-8" and uploading again.'
                )
        rows = list(csv.reader(io.StringIO(text)))
    elif lower.endswith(".xlsx"):
        try:
            import pandas as pd

            frame = pd.read_excel(io.BytesIO(file_bytes), header=None, dtype=object)
        except Exception as exc:  # corrupt or password-protected workbook
            raise ValueError(f"Couldn't open this Excel file: {exc}")
        rows = [["" if (v is None or v != v) else str(v) for v in record] for record in frame.values.tolist()]
    else:
        raise ValueError("Only .csv and .xlsx files are supported. Download the holdings file from your broker as CSV or Excel.")
    return [[str(c) for c in row] for row in rows]


def _detect(headers: List[str]) -> Optional[str]:
    """Which broker layout this header row belongs to, or None."""
    h = set(headers)
    if "quantity available" in h and "average price" in h:
        return "zerodha_console"
    if "instrument" in h and "qty." in h and "avg. cost" in h:
        return "zerodha_kite"
    if "stock name" in h and "average buy price" in h and "quantity" in h:
        return "groww"
    if "symbol" in h and "quantity" in h and ("average cost basis" in h or "cost basis total" in h) and "last price" in h:
        return "fidelity"
    if "financial instrument" in h and "position" in h:
        return "ibkr_portfolio"
    if h & set(SYMBOL_ALIASES[:3]) and h & set(QTY_ALIASES) and h & set(COST_ALIASES):
        return "generic"
    return None


def _col(headers: List[str], aliases: Tuple[str, ...]) -> Optional[int]:
    for alias in aliases:
        if alias in headers:
            return headers.index(alias)
    return None


def _cell(row: List[str], idx: Optional[int]) -> str:
    if idx is None or idx >= len(row):
        return ""
    return str(row[idx]).strip()


def _clean_symbol(raw: str) -> str:
    return re.sub(r"\s+", "", raw or "").upper()


def _strip_series(symbol: str) -> str:
    """Zerodha shows trading series on the ticker ('XYZ-BE'). The price source
    wants the plain ticker."""
    return re.sub(r"-(BE|BZ|SM|ST|IL|GB)$", "", symbol)


def _row(symbol: str, name: str, quantity: float, price: float, currency: str, country: str,
         account: str, on: date, existing: Set[Tuple[str, str]]) -> Dict:
    key = (account.strip().lower(), symbol.upper())
    return {
        "asset_type": "stock",
        "symbol": symbol,
        "name": name or symbol,
        "account": account,
        "source_account": None,
        "transaction_type": "buy",
        "quantity": quantity,
        "price_per_unit": price,
        "date": on.isoformat(),
        "value": round(quantity * price, 4),
        "currency": currency,
        "country": country,
        "already_in_account": bool(symbol) and key in existing,
    }


def _from_table(rows: List[List[str]], start: int, broker: str, headers: List[str], currency_default: str,
                country_default: str, account: str, on: date, existing: Set[Tuple[str, str]],
                warnings: List[str]) -> List[Dict]:
    out: List[Dict] = []
    sym_i = _col(headers, ("symbol", "ticker", "instrument", "financial instrument"))
    name_i = _col(headers, ("description", "stock name", "name", "security"))
    if broker == "groww":
        sym_i = None
        name_i = _col(headers, ("stock name",))
    qty_i = _col(headers, ("quantity", "qty.", "qty", "shares", "position", "units"))
    cost_i = _col(headers, COST_ALIASES)
    total_i = _col(headers, ("cost basis total", "invested", "buy value"))
    last_i = _col(headers, ("last price", "ltp", "close price", "market price", "previous closing price"))
    cur_i = _col(headers, ("currency",))
    available_i = _col(headers, ("quantity available",))
    extra_qty = [_col(headers, (n,)) for n in ("quantity long term", "quantity pledged (margin)", "quantity pledged (loan)")]

    used_last_price = 0
    no_ticker = 0
    for raw in rows[start:]:
        if not any(str(c).strip() for c in raw):
            continue
        name = _cell(raw, name_i)
        symbol = _clean_symbol(_cell(raw, sym_i)) if sym_i is not None else ""
        if broker == "groww":
            symbol = ""
        if symbol.endswith("**"):
            warnings.append(f"Skipped {symbol.rstrip('*')}: money market funds are cash, add that under Cash & Bank Accounts.")
            continue
        if symbol.startswith("-"):
            warnings.append(f"Skipped '{_cell(raw, sym_i)}': options are not supported.")
            continue
        if broker == "zerodha_console":
            parts = [parse_number(_cell(raw, available_i))] + [parse_number(_cell(raw, i)) for i in extra_qty]
            numbers = [p for p in parts if p]
            quantity = sum(numbers) if numbers else None
        else:
            quantity = parse_number(_cell(raw, qty_i))
        if quantity is None or quantity <= 0:
            # Footer lines, totals, pending activity and sold-out rows land here.
            continue
        if not symbol and broker != "groww":
            continue
        if broker == "groww" and not name:
            continue
        price = parse_number(_cell(raw, cost_i))
        if (price is None or price <= 0) and total_i is not None:
            total = parse_number(_cell(raw, total_i))
            if total and total > 0:
                price = total / quantity
        if price is None or price <= 0:
            price = parse_number(_cell(raw, last_i))
            if price is not None and price > 0:
                used_last_price += 1
        if price is None or price <= 0:
            warnings.append(f"Skipped {symbol or name}: no average cost or price in the file.")
            continue

        currency = currency_default
        if cur_i is not None:
            c = _cell(raw, cur_i).upper()
            if c in VALID_CURRENCIES:
                currency = c
        country = COUNTRY_BY_CURRENCY.get(currency) or (country_default if currency == currency_default else "United States")
        if broker == "zerodha_kite" or broker == "zerodha_console":
            symbol = _strip_series(symbol)
        if broker == "groww":
            no_ticker += 1
        out.append(_row(symbol, name, quantity, price, currency, country, account, on, existing))
        if len(out) >= MAX_ROWS:
            warnings.append(f"Stopped after {MAX_ROWS} rows.")
            break

    if used_last_price:
        warnings.append(
            f"{used_last_price} row{'s' if used_last_price != 1 else ''} had no average cost in the file, so the last price "
            "was used as the cost. Check the Price column before importing."
        )
    if broker == "groww" and no_ticker:
        warnings.append(
            "Groww files list company names, not tickers. Fill in the Symbol for each row (for example RELIANCE) so prices "
            "can update. Rows without a symbol still import, but stay at the cost you paid."
        )
    if broker == "zerodha_console":
        warnings.append(
            "Quantity adds up the available, long term and pledged columns. Compare a few rows with your broker app."
        )
    return out


def _from_ibkr_activity(rows: List[List[str]], account: str, on: date, existing: Set[Tuple[str, str]],
                        warnings: List[str], country_default: str) -> List[Dict]:
    out: List[Dict] = []
    headers: List[str] = []
    for raw in rows:
        if not raw or _norm(raw[0]) != "open positions":
            continue
        kind = _norm(raw[1]) if len(raw) > 1 else ""
        cells = [_norm(c) for c in raw[2:]]
        if kind == "header":
            headers = cells
            continue
        if kind != "data" or not headers:
            continue
        values = raw[2:]

        def get(name):
            return values[headers.index(name)].strip() if name in headers and headers.index(name) < len(values) else ""

        if get("datadiscriminator").lower() not in ("summary", ""):
            continue
        asset = get("asset category").lower()
        if asset and asset not in ("stocks", "stock", "etfs", "etf"):
            warnings.append(f"Skipped {get('symbol') or 'a row'}: {get('asset category')} are not imported from this file.")
            continue
        quantity = parse_number(get("quantity"))
        price = parse_number(get("cost price"))
        if quantity is None or quantity <= 0 or price is None or price <= 0:
            continue
        currency = get("currency").upper()
        if currency not in VALID_CURRENCIES:
            currency = "USD"
        country = COUNTRY_BY_CURRENCY.get(currency, "United States")
        symbol = _clean_symbol(get("symbol"))
        if not symbol:
            continue
        out.append(_row(symbol, symbol, quantity, price, currency, country, account, on, existing))
    return out


def parse_broker_file(file_bytes: bytes, filename: str, account: str, as_of: Optional[date] = None,
                      existing: Optional[Set[Tuple[str, str]]] = None, default_currency: str = "USD",
                      default_country: str = "United States") -> Dict:
    """Returns {"broker", "broker_label", "rows", "warnings"}. Raises ValueError
    for a file that cannot be read or is not a holdings table at all."""
    account = (account or "").strip()
    if not account:
        raise ValueError("Enter the account name these holdings belong to, for example 'Zerodha' or 'Fidelity'.")
    on = as_of or date.today()
    existing = existing or set()
    warnings: List[str] = []

    grid = read_grid(file_bytes, filename)
    if not grid:
        raise ValueError("The file appears to be empty.")

    broker = None
    header_at = None
    headers: List[str] = []
    if any(r and _norm(r[0]) == "open positions" for r in grid):
        broker = "ibkr_activity"
    else:
        for i, raw in enumerate(grid[:60]):
            cells = [_norm(c) for c in raw]
            found = _detect(cells)
            if found:
                broker, header_at, headers = found, i, cells
                break
    if broker is None:
        raise ValueError(
            "This does not look like a holdings file. It needs a symbol, a quantity and an average cost column. "
            "Supported: Zerodha, Groww, Fidelity and Interactive Brokers downloads."
        )

    if broker == "ibkr_activity":
        rows = _from_ibkr_activity(grid, account, on, existing, warnings, default_country)
    else:
        currency, country = BROKER_DEFAULTS.get(broker, (default_currency, default_country))
        rows = _from_table(grid, header_at + 1, broker, headers, currency, country, account, on, existing, warnings)

    if not rows and not warnings:
        warnings.append("Found the holdings table but no rows with a quantity and an average cost.")
    dupes = sum(1 for r in rows if r["already_in_account"])
    if dupes:
        warnings.append(
            f"{dupes} holding{'s are' if dupes != 1 else ' is'} already in the '{account}' account and left unticked. "
            "Importing them again would add the quantity a second time."
        )
    return {"broker": broker, "broker_label": BROKER_LABELS[broker], "rows": rows, "warnings": warnings}
