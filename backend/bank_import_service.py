"""
AI-assisted import of a bank/credit card statement (CSV, Excel, or PDF)
into Budget entries. Mirrors smart_import_service.py's structure closely —
same review-before-confirm flow, same two-phase validate-then-write
pattern — but targets BudgetEntry instead of Holding, and additionally
handles PDF statements via pdfplumber (CSV/Excel reuse the pandas path
already used for net worth spreadsheet import).
"""
import io
import json
from datetime import date
from typing import Dict, List, Optional

import pandas as pd
import pdfplumber

from . import ai_service
from .models import db, BudgetEntry
from .budget_service import INCOME_CATEGORIES, EXPENSE_CATEGORIES

MAX_ROWS_TO_SEND = 300  # keeps the prompt bounded for unusually long statements
VALID_FREQUENCIES = ("weekly", "monthly", "quarterly", "yearly")


def _extract_from_tabular(file_bytes: bytes, filename: str) -> str:
    buf = io.BytesIO(file_bytes)
    if filename.lower().endswith(".csv"):
        df = pd.read_csv(buf)
    else:
        df = pd.read_excel(buf, engine="openpyxl")
    df = df.dropna(how="all").dropna(axis=1, how="all")
    if df.empty:
        return ""
    return df.head(MAX_ROWS_TO_SEND).to_csv(index=False)


def _extract_from_pdf(file_bytes: bytes) -> str:
    """Bank statement PDFs usually have a clean transaction table; when
    pdfplumber can detect one we render it as CSV-like rows (much denser
    and more reliable for the AI prompt than raw text), falling back to
    plain extracted text for pages without a detected table."""
    parts = []
    total_rows = 0
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            if total_rows >= MAX_ROWS_TO_SEND:
                break
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    rows = [",".join(str(cell) if cell is not None else "" for cell in row) for row in table]
                    parts.append("\n".join(rows))
                    total_rows += len(table)
            else:
                text = page.extract_text()
                if text:
                    parts.append(text)
    return "\n\n".join(parts)


def extract_statement_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        return _extract_from_pdf(file_bytes)
    return _extract_from_tabular(file_bytes, filename)


BANK_IMPORT_SYSTEM_PROMPT = f"""You read a bank or credit card statement (CSV, Excel, or text/table extracted
from a PDF) and extract every real transaction, categorizing each one.

Valid category values for a debit (money out): {", ".join(EXPENSE_CATEGORIES)}
Valid category values for a credit (money in): {", ".join(INCOME_CATEGORIES)}

Respond with ONLY a JSON object, no other text, shaped exactly like:
{{
  "transactions": [
    {{
      "date": "2026-01-15",
      "description": "NETFLIX.COM",
      "amount": 15.99,
      "direction": "debit",
      "category": "entertainment",
      "is_recurring_guess": true
    }}
  ],
  "warnings": ["Skipped row 'Beginning balance' — not a real transaction"]
}}

Rules:
- One entry per actual transaction — skip running/opening/closing balance lines, headers, and subtotals;
  mention skips in "warnings".
- "direction" is "debit" for money leaving the account (a purchase, a bill, a fee) or "credit" for money
  coming in (a deposit, a refund, a paycheck).
- "category" must be one of the valid values for that direction above — pick the closest match; if nothing
  fits well, use "other_expense" for a debit or "other_income" for a credit.
- "is_recurring_guess": true only for things that are clearly recurring by nature (a subscription service,
  rent, a utility bill, a loan/insurance payment) — judge by the description, not by seeing it more than once.
- "amount" is always a positive number regardless of direction.
- Never fabricate a transaction that isn't actually represented in the data.
"""


def parse_statement(file_bytes: bytes, filename: str) -> Dict:
    if not ai_service.is_configured():
        return {"configured": False, "rows": [], "warnings": []}

    try:
        statement_text = extract_statement_text(file_bytes, filename)
    except Exception as e:
        return {"configured": True, "rows": [], "warnings": [f"Couldn't read the file: {e}"]}

    if not statement_text.strip():
        return {"configured": True, "rows": [], "warnings": ["The file appears to be empty or unreadable."]}

    try:
        raw = ai_service.generate_text(statement_text, system=BANK_IMPORT_SYSTEM_PROMPT, max_tokens=4096)
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
        return {"configured": True, "rows": [], "warnings": [f"AI couldn't parse this statement's structure: {e}"]}

    transactions = parsed.get("transactions", []) if isinstance(parsed, dict) else []
    warnings = parsed.get("warnings", []) if isinstance(parsed, dict) else []

    validated_rows = []
    for row in transactions:
        if not isinstance(row, dict) or row.get("direction") not in ("debit", "credit"):
            warnings.append(f"Skipped a row with an unrecognized direction: {row}")
            continue
        valid_categories = EXPENSE_CATEGORIES if row["direction"] == "debit" else INCOME_CATEGORIES
        if row.get("category") not in valid_categories:
            row["category"] = "other_expense" if row["direction"] == "debit" else "other_income"
        row.setdefault("date", date.today().isoformat())
        validated_rows.append(row)

    return {"configured": True, "rows": validated_rows, "warnings": warnings}


def _validate_row(row: Dict) -> Dict:
    """Raises ValueError with a human-readable message if the row can't be
    imported; otherwise returns a normalized copy. Pure — no DB writes —
    same reasoning as smart_import_service._validate_row: check every row
    before writing any of them, so one malformed row can't force a partial
    transaction to be unwound mid-import."""
    direction = row.get("direction")
    if direction not in ("debit", "credit"):
        raise ValueError(f"direction must be 'debit' or 'credit', got '{direction}'")
    entry_type = "expense" if direction == "debit" else "income"

    valid_categories = EXPENSE_CATEGORIES if entry_type == "expense" else INCOME_CATEGORIES
    category = row.get("category")
    if category not in valid_categories:
        raise ValueError(f"category '{category}' is not valid for a {entry_type}")

    has_amount = row.get("amount") is not None and row.get("amount") != ""
    amount = float(row["amount"]) if has_amount else 0.0
    if amount <= 0:
        raise ValueError("amount must be greater than 0")

    entry_date = date.fromisoformat(row.get("date") or date.today().isoformat())

    is_recurring = bool(row.get("is_recurring_guess") or row.get("is_recurring"))
    recurring_frequency = row.get("recurring_frequency")
    if recurring_frequency not in VALID_FREQUENCIES:
        recurring_frequency = "monthly" if is_recurring else None

    return {
        "entry_type": entry_type,
        "entry_date": entry_date,
        "amount": amount,
        "category": category,
        "description": (row.get("description") or "").strip()[:500] or None,
        "is_recurring": is_recurring,
        "recurring_frequency": recurring_frequency,
    }


def confirm_bank_import(rows: List[Dict], user_id, household_id: Optional[str] = None, currency: str = "USD") -> Dict:
    """Validates every row first (no DB writes), then writes only the rows
    that passed validation in a single pass — mirrors
    smart_import_service.confirm_smart_import exactly."""
    normalized_rows = []
    errors = []
    for i, row in enumerate(rows):
        try:
            normalized_rows.append(_validate_row(row))
        except (ValueError, TypeError, KeyError) as e:
            errors.append({"row": i, "error": str(e)})

    created = 0
    for row in normalized_rows:
        db.session.add(BudgetEntry(
            user_id=user_id,
            household_id=household_id,
            entry_type=row["entry_type"],
            entry_date=row["entry_date"],
            amount=row["amount"],
            currency=currency,
            category=row["category"],
            description=row["description"],
            is_recurring=row["is_recurring"],
            recurring_frequency=row["recurring_frequency"],
        ))
        created += 1

    db.session.commit()
    return {"entries_created": created, "errors": errors}
