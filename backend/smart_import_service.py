"""
AI-assisted import of a freeform personal net worth spreadsheet — unlike
csv_import_service.py, which parses known broker export formats, this
reads whatever layout someone already uses (an Excel file with a stocks
tab, a real estate row, a bank balance, etc.) and asks Claude to map it
onto this app's holding schema. Preview-then-confirm, same as broker CSV
import: nothing is saved until the parsed rows are reviewed and confirmed.
"""
import io
import json
from datetime import date
from typing import Dict, List, Optional

import pandas as pd

from . import ai_service
from .models import db, Holding, HoldingTransaction, HoldingValuation
from .holdings_service import QUANTITY_BASED_TYPES

MAX_ROWS_TO_SEND = 300  # keeps the prompt bounded for unusually large sheets

VALID_ASSET_TYPES = (
    "stock", "mutual_fund", "crypto", "commodity",
    "real_estate", "fixed_deposit", "ppf", "epf", "cash", "loan",
)
VALID_COUNTRIES = ("United States", "India", "Australia")
VALID_CURRENCIES = ("USD", "INR", "AUD")


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
whatever ad-hoc layout the person already uses) and map each real holding to this app's schema.

Valid asset_type values: {", ".join(VALID_ASSET_TYPES)}
Valid country values: {", ".join(VALID_COUNTRIES)} (best guess from currency/context; default "United States" if unclear)
Valid currency values: {", ".join(VALID_CURRENCIES)} (infer from symbols like $/₹/A$, or country)

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
      "source_note": "row 3, 'Apple' sheet"
    }}
  ],
  "warnings": ["Skipped row 'Misc total' — not a real holding"]
}}

Rules:
- One row per actual holding (a stock position, a bank account, a house, a loan, etc.) — skip totals,
  headers, blank separators, and notes that aren't holdings themselves; mention skips in "warnings".
- "value" (current total value) is required for every row — it's the one field you should always be
  able to determine. "quantity" and "price_per_unit" are optional refinements: include them only if the
  sheet actually states them (e.g. a share count and a price), don't invent numbers that aren't there.
- For stock/mutual_fund/crypto/commodity without a clear symbol, still include the row with your best
  guess at "name" and leave "symbol" as null — the person will fix it in the review step.
- "date" is the date the value is as-of, if stated; otherwise use today's date.
- Real estate, cash, loans, fixed deposits, PPF, EPF never need "symbol", "quantity", or "price_per_unit".
- Never fabricate a holding that isn't actually represented in the data.
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

    client = ai_service.get_client()
    try:
        response = client.messages.create(
            model=ai_service.AI_MODEL,
            max_tokens=4096,
            system=SMART_IMPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": sheet_text}],
        )
        raw = response.content[0].text.strip() if response.content else ""
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[raw.find("{"):]
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError, IndexError, KeyError) as e:
        return {"configured": True, "rows": [], "warnings": [f"AI couldn't parse this file's structure: {e}"]}
    except Exception as e:  # anthropic API errors etc.
        return {"configured": True, "rows": [], "warnings": [f"AI parsing failed: {e}"]}

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
    }
    if asset_type in QUANTITY_BASED_TYPES:
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
    row can't corrupt or partially-roll-back the rows around it."""
    normalized_rows = []
    errors = []
    for i, row in enumerate(rows):
        try:
            normalized_rows.append(_validate_row(row))
        except (ValueError, TypeError, KeyError) as e:
            errors.append({"row": i, "error": str(e)})

    created = 0
    for row in normalized_rows:
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
    return {"holdings_created": created, "errors": errors}
