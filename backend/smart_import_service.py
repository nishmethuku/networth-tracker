"""
AI-assisted import of a freeform personal spreadsheet — unlike
simple_csv_import_service.py, which expects one fixed column format and
never calls the AI, this reads whatever layout someone already uses and
asks the AI to map it onto this app's schema. Preview-then-confirm, same
as the simple importer: nothing is saved until the parsed rows are
reviewed and confirmed. Currently unlinked from navigation (kept for
later — see simple_csv_import_service.py's docstring for why).

Handles two different shapes of input, both through the same endpoint:
  - A snapshot sheet (one row per holding, a current value) -- the
    original use case: a stocks tab, a real estate row, a bank balance.
  - A transaction log (one row per buy/sell event, e.g. a "Src fund ac,
    Target ac, Stock symbol, Date, Qty, price, Transaction type" export) --
    each row becomes its own HoldingTransaction rather than a fresh
    holding, multiple rows for the same symbol+account merge into one
    holding with several transactions, and a funding/source account column
    is resolved against the user's existing cash holdings by name so a buy
    can deduct its cost the same way the manual "Funded from" picker does
    (see build_funding_valuation).
"""
import io
import json
from datetime import date, timedelta
from typing import Dict, List, Optional

import pandas as pd

from . import ai_service
from .holdings_service import QUANTITY_BASED_TYPES, build_deposit_valuation, build_funding_valuation
from .models import Holding, HoldingTransaction, HoldingValuation, db

MAX_ROWS_TO_SEND = 300  # keeps the prompt bounded for unusually large sheets

VALID_ASSET_TYPES = (
    "stock", "mutual_fund", "crypto", "commodity",
    "real_estate", "fixed_deposit", "ppf", "epf", "retirals", "cash", "loan", "credit",
)
VALID_COUNTRIES = ("United States", "India", "Australia")
VALID_CURRENCIES = ("USD", "INR", "AUD")
VALID_TRANSACTION_TYPES = ("buy", "sell")


def extract_sheet_text(file_bytes: bytes, filename: str) -> str:
    """Renders every sheet/tab of the uploaded file as a compact CSV-ish
    text block for the AI prompt. Blank rows/columns are dropped so a
    typically sparse personal spreadsheet doesn't waste prompt space."""
    buf = io.BytesIO(file_bytes)
    if filename.lower().endswith(".csv"):
        sheets = {"Sheet1": pd.read_csv(buf)}
    else:
        sheets = pd.read_excel(buf, sheet_name=None, engine="openpyxl")

    parts = []
    total_rows = 0
    for name, df in sheets.items():
        if df is None or df.empty:
            continue
        df = df.dropna(how="all").dropna(axis=1, how="all")
        if df.empty:
            continue
        remaining = MAX_ROWS_TO_SEND - total_rows
        if remaining <= 0:
            break
        trimmed = df.head(remaining)
        total_rows += len(trimmed)
        parts.append(f"--- Sheet: {name} ---\n{trimmed.to_csv(index=False)}")
    return "\n\n".join(parts)


SMART_IMPORT_SYSTEM_PROMPT = f"""You read a personal net worth spreadsheet (not a standardized broker export —
whatever ad-hoc layout the person already uses) and map each row to this app's schema.

Valid asset_type values: {", ".join(VALID_ASSET_TYPES)}
Valid country values: {", ".join(VALID_COUNTRIES)} (best guess from currency/context; default "United States" if unclear)
Valid currency values: {", ".join(VALID_CURRENCIES)} (infer from symbols like $/₹/A$, or country)
Valid transaction_type values: {", ".join(VALID_TRANSACTION_TYPES)}

Respond with ONLY a JSON object, no other text, shaped exactly like:
{{
  "rows": [
    {{
      "asset_type": "stock",
      "name": "Apple Inc",
      "symbol": "AAPL",
      "quantity": 50,
      "price_per_unit": 195.20,
      "value": 9760.0,
      "currency": "USD",
      "country": "United States",
      "account": "",
      "date": "2026-01-01",
      "transaction_type": null,
      "source_account": null,
      "source_note": "row 3, 'Apple' sheet"
    }}
  ],
  "warnings": ["Skipped row 'Misc total' — not a real holding"]
}}

Two different kinds of sheet come through here — tell them apart from the columns present:

1. A SNAPSHOT sheet: one row per holding, stating its current value (a stocks tab, a real estate row, a
   bank balance). This is the common case. Leave "transaction_type" and "source_account" null.
2. A TRANSACTION LOG: one row per buy/sell event, e.g. columns like "Src fund ac, Target ac, Stock
   symbol, Date, Qty, price, Transaction type" — the same symbol may appear on several rows (a buy, then
   later a sell). For this kind:
   - Emit one output row per transaction row in the sheet — do NOT merge multiple transactions for the
     same symbol into a single row; merging happens after import, not here.
   - Set "transaction_type" to "buy" or "sell" from that column.
   - "account" is where the position is held (a "Target ac" / brokerage column).
   - "source_account" is the OTHER account money moved through on a buy — a "Src fund ac" / funding
     account column, if the sheet has one. Pass through whatever name is in that column verbatim (e.g.
     "Vijay Chase"); it gets matched against the person's existing accounts after this step, not by you.
     Leave it null for a sell, and null if the sheet has no such column at all.
   - "quantity" and "price_per_unit" are required for a quantity-based row (stock/mutual_fund/crypto/
     commodity); "value" should be quantity * price_per_unit. For a non-quantity row (real estate, a fixed
     deposit, PPF, EPF, cash, a loan) on a transaction log, still include a "Units"/"Qty"-style column's
     number if the sheet has one, but what actually matters is "value" -- set it from that row directly
     (a lump amount column) or as quantity * price if that's what the sheet gives instead.
   - "date" is the transaction date. Column headers vary a lot (e.g. "Src fund ac"/"Source", "Target
     ac"/"Account", "Stock symbol"/"Stock", "Transaction type"/"Transaction", "Qty"/"Transaction Units",
     "price"/"Transaction price") — map by meaning, not by exact header text. Ignore any extra column that
     doesn't map to one of these (e.g. a broker/institution name) rather than guessing what it means.

Rules:
- One row per actual holding or transaction — skip totals, headers, blank separators, and notes that
  aren't real entries; mention skips in "warnings".
- "value" (current total value, or quantity * price_per_unit for a transaction row) is required for every
  row. For a snapshot row, "quantity" and "price_per_unit" are optional refinements: include them only if
  the sheet actually states them, don't invent numbers that aren't there.
- For stock/mutual_fund/crypto/commodity without a clear symbol, still include the row with your best
  guess at "name" and leave "symbol" as null — the person will fix it in the review step.
- Always output "date" as YYYY-MM-DD regardless of the input format (e.g. "7/8/2020", "6/10/2024",
  "Jan 5 2026"). If a date is genuinely ambiguous (day vs. month order) just make your best guess — it's
  editable in the review step before anything is saved.
- Real estate, cash, loans, fixed deposits, PPF, EPF never need "symbol", "quantity", or "price_per_unit".
- Never fabricate a row that isn't actually represented in the data.
"""


def parse_spreadsheet(file_bytes: bytes, filename: str) -> Dict:
    if not ai_service.is_configured():
        return {"configured": False, "rows": [], "warnings": []}

    try:
        sheet_text = extract_sheet_text(file_bytes, filename)
    except Exception as e:
        return {"configured": True, "rows": [], "warnings": [f"Couldn't read the file: {e}"]}

    if not sheet_text.strip():
        return {"configured": True, "rows": [], "warnings": ["The file appears to be empty."]}

    try:
        raw = ai_service.generate_text(sheet_text, system=SMART_IMPORT_SYSTEM_PROMPT, max_tokens=4096)
    except ai_service.QuotaExceededError:
        return {
            "configured": True, "rows": [], "quota_exceeded": True,
            "warnings": ["The AI assistant has hit its free daily usage limit — please try again later."],
        }
    if not raw:
        return {"configured": True, "rows": [], "warnings": ["AI parsing failed — please try again."]}
    try:
        parsed = ai_service._extract_json(raw)
    except (json.JSONDecodeError, ValueError, IndexError, KeyError) as e:
        return {"configured": True, "rows": [], "warnings": [f"AI couldn't parse this file's structure: {e}"]}

    rows = parsed.get("rows", []) if isinstance(parsed, dict) else []
    warnings = parsed.get("warnings", []) if isinstance(parsed, dict) else []

    validated_rows = []
    for row in rows:
        if not isinstance(row, dict) or row.get("asset_type") not in VALID_ASSET_TYPES:
            warnings.append(f"Skipped a row with an unrecognized type: {row}")
            continue
        row.setdefault("country", "United States")
        if row["country"] not in VALID_COUNTRIES:
            row["country"] = "United States"
        row.setdefault("currency", "USD")
        if row["currency"] not in VALID_CURRENCIES:
            row["currency"] = "USD"
        row.setdefault("date", date.today().isoformat())
        if row.get("transaction_type") not in VALID_TRANSACTION_TYPES:
            row["transaction_type"] = None
        row.setdefault("source_account", None)
        validated_rows.append(row)

    return {"configured": True, "rows": validated_rows, "warnings": warnings}


def _validate_row(row: Dict) -> Dict:
    """Raises ValueError with a human-readable message if the row can't be
    imported; otherwise returns a normalized copy. Pure — no DB writes —
    so every row can be checked before anything is written, rather than
    risking a partial transaction that has to be unwound mid-import."""
    asset_type = row.get("asset_type")
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"Unknown asset_type '{asset_type}'")

    transaction_type = row.get("transaction_type") or None
    if transaction_type is not None and transaction_type not in VALID_TRANSACTION_TYPES:
        raise ValueError(f"Unknown transaction_type '{transaction_type}'")

    entry_date = date.fromisoformat(row.get("date") or date.today().isoformat())
    value = float(row.get("value") or 0)

    normalized = {
        "asset_type": asset_type,
        "symbol": row.get("symbol") or None,
        "name": row.get("name") or row.get("symbol") or "Imported holding",
        "country": row.get("country") or "United States",
        "account": row.get("account") or "",
        "currency": row.get("currency") or "USD",
        "date": entry_date,
        "value": value,
        "transaction_type": transaction_type,
        "source_account": (row.get("source_account") or "").strip() or None,
    }
    if asset_type in QUANTITY_BASED_TYPES:
        if transaction_type:
            # A transaction-log row -- quantity and price are the point of
            # it, not an optional refinement to fall back away from.
            try:
                quantity = float(row["quantity"])
                price_per_unit = float(row["price_per_unit"])
            except (KeyError, TypeError, ValueError):
                raise ValueError("Transaction rows need a quantity and a price")
            if quantity <= 0:
                raise ValueError("quantity must be greater than 0")
        else:
            has_quantity = row.get("quantity") is not None and row.get("quantity") != ""
            quantity = float(row["quantity"]) if has_quantity else 1.0
            if quantity <= 0:
                raise ValueError("quantity must be greater than 0")
            has_price = row.get("price_per_unit") is not None and row.get("price_per_unit") != ""
            price_per_unit = float(row["price_per_unit"]) if has_price else (value / quantity if quantity else value)
        normalized["quantity"] = quantity
        normalized["price_per_unit"] = price_per_unit
    return normalized


def confirm_smart_import(rows: List[Dict], user_id, household_id: Optional[str] = None) -> Dict:
    """Validates every row first (no DB writes), then writes only the rows
    that passed validation in a single transaction — so one malformed AI
    row can't corrupt or partially-roll-back the rows around it.

    Snapshot rows (no transaction_type) keep the original behavior: one
    fresh holding per row. Transaction-log rows (transaction_type set) are
    grouped by (asset_type, symbol/name, account, currency) so several
    buy/sell rows for the same position merge into one holding with
    multiple transactions instead of a duplicate holding per row -- both
    against holdings already in this batch and against ones that already
    exist in the account, so re-running an import (or importing a top-up)
    adds to the existing holding rather than forking it.
    """
    normalized_rows = []
    errors = []
    for i, row in enumerate(rows):
        try:
            normalized_rows.append(_validate_row(row))
        except (ValueError, TypeError, KeyError) as e:
            errors.append({"row": i, "error": str(e)})

    def holding_key(row):
        return (row["asset_type"], (row["symbol"] or row["name"]).upper(), row["account"], row["currency"])

    batch_holdings = {}  # holding_key -> Holding, for rows created earlier in this same import
    created_cash_holdings = {}  # lowercased source_account name -> Holding, same reasoning
    created = 0
    transactions_added = 0
    warnings = []

    for row in normalized_rows:
        if row["transaction_type"]:
            key = holding_key(row)
            holding = batch_holdings.get(key)
            if holding is None:
                holding = Holding.query.filter_by(
                    user_id=user_id, household_id=household_id,
                    asset_type=row["asset_type"], account=row["account"], currency=row["currency"],
                ).filter(
                    (Holding.symbol == row["symbol"]) if row["symbol"] else (Holding.name == row["name"])
                ).first()
            if holding is None:
                holding = Holding(
                    user_id=user_id, household_id=household_id,
                    asset_type=row["asset_type"], symbol=row["symbol"], name=row["name"],
                    country=row["country"], account=row["account"], currency=row["currency"],
                )
                db.session.add(holding)
                db.session.flush()
                created += 1
            batch_holdings[key] = holding

            # Quantity-based types (stock/mutual_fund/crypto/commodity) get a
            # real buy/sell HoldingTransaction, same as everywhere else in
            # the app. Everything else (real estate, fixed deposits, loans,
            # ...) doesn't have transactions at all here -- a "Buy" row for
            # one of those just means "this is the value as of this date",
            # so it becomes a HoldingValuation instead. _validate_row never
            # populated quantity/price_per_unit for these, so branching is
            # required, not optional -- reaching for those keys below would
            # KeyError.
            if row["asset_type"] in QUANTITY_BASED_TYPES:
                db.session.add(HoldingTransaction(
                    holding_id=holding.id, user_id=user_id,
                    transaction_type=row["transaction_type"],
                    transaction_date=row["date"], quantity=row["quantity"], price_per_unit=row["price_per_unit"],
                    currency=holding.currency,
                ))
            else:
                db.session.add(HoldingValuation(
                    holding_id=holding.id, user_id=user_id,
                    valuation_date=row["date"], value=row["value"], currency=holding.currency,
                ))
            transactions_added += 1

            # source_account works both directions: a buy deducts its cost
            # from it (money went out to fund the purchase), a sell deposits
            # its proceeds into it (money came back in) -- the same account
            # column in the sheet just describes "the other side of this
            # stock's cash flow" regardless of which way it went.
            if row["transaction_type"] in ("buy", "sell") and row["source_account"]:
                source_key = row["source_account"].lower()
                source_holding = created_cash_holdings.get(source_key)
                if source_holding is None:
                    source_holding = Holding.query.filter(
                        Holding.user_id == user_id, Holding.household_id == household_id,
                        Holding.asset_type == "cash", db.func.lower(Holding.name) == source_key,
                    ).first()
                is_newly_created = False
                if source_holding is None:
                    # Auto-create the account rather than skipping the
                    # deduction/deposit -- a cash holding needs a starting
                    # balance to work from, so it's seeded at 0 the day
                    # before this transaction; a buy's deduction then
                    # correctly leaves it negative (an overdraft, in
                    # effect) rather than raising "no recorded balance yet"
                    # (a sell's deposit works from an empty history fine
                    # either way, but seeding it keeps both cases uniform).
                    source_holding = Holding(
                        user_id=user_id, household_id=household_id,
                        asset_type="cash", symbol=None, name=row["source_account"],
                        country=row["country"], account="", currency=row["currency"],
                    )
                    db.session.add(source_holding)
                    db.session.flush()
                    db.session.add(HoldingValuation(
                        holding_id=source_holding.id, user_id=user_id,
                        valuation_date=row["date"] - timedelta(days=1), value=0.0, currency=row["currency"],
                    ))
                    is_newly_created = True
                    created += 1
                created_cash_holdings[source_key] = source_holding

                source_valuations = HoldingValuation.query.filter_by(holding_id=source_holding.id).all()
                amount = row["quantity"] * row["price_per_unit"] if row["asset_type"] in QUANTITY_BASED_TYPES else row["value"]
                verb = "deduct" if row["transaction_type"] == "buy" else "deposit into"
                try:
                    if row["transaction_type"] == "buy":
                        valuation = build_funding_valuation(source_holding, source_valuations, amount, row["currency"], row["date"], user_id)
                    else:
                        proceeds_note = f"Proceeds from selling {row['symbol'] or row['name']}"
                        valuation = build_deposit_valuation(
                            source_holding, source_valuations, amount, row["currency"], row["date"], user_id, notes=proceeds_note
                        )
                    db.session.add(valuation)
                    if is_newly_created:
                        warnings.append(
                            f"'{row['source_account']}' didn't exist as a cash holding -- created it "
                            f"(starting balance $0, so it may show a negative balance after this import)."
                        )
                except ValueError as e:
                    warnings.append(f"Couldn't {verb} '{row['source_account']}' for a {row['symbol'] or row['name']} {row['transaction_type']}: {e}")
            continue

        holding = Holding(
            user_id=user_id,
            household_id=household_id,
            asset_type=row["asset_type"],
            symbol=row["symbol"],
            name=row["name"],
            country=row["country"],
            account=row["account"],
            currency=row["currency"],
        )
        db.session.add(holding)
        db.session.flush()  # assign holding.id within the same transaction

        if row["asset_type"] in QUANTITY_BASED_TYPES:
            db.session.add(HoldingTransaction(
                holding_id=holding.id,
                user_id=user_id,
                transaction_type="buy",
                transaction_date=row["date"],
                quantity=row["quantity"],
                price_per_unit=row["price_per_unit"],
                currency=holding.currency,
            ))
        else:
            db.session.add(HoldingValuation(
                holding_id=holding.id,
                user_id=user_id,
                valuation_date=row["date"],
                value=row["value"],
                currency=holding.currency,
            ))
        created += 1

    db.session.commit()
    return {"holdings_created": created, "transactions_added": transactions_added, "errors": errors, "warnings": warnings}
