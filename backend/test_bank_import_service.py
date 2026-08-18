import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from backend.bank_import_service import _validate_row, extract_statement_text, confirm_bank_import


def _minimal_pdf(text_lines):
    """Hand-rolled single-page PDF with a text content stream — avoids
    pulling in a PDF-writing dependency just for test fixtures."""
    content_stream = "BT /F1 12 Tf 50 750 Td\n"
    for i, line in enumerate(text_lines):
        if i > 0:
            content_stream += "0 -15 Td\n"
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content_stream += f"({escaped}) Tj\n"
    content_stream += "ET"
    content_bytes = content_stream.encode("latin-1")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
        b"/MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"5 0 obj\n<< /Length " + str(len(content_bytes)).encode() + b" >>\nstream\n"
        + content_bytes + b"\nendstream\nendobj\n",
    ]

    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj
    xref_offset = len(pdf)
    pdf += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n"
    for off in offsets[1:]:
        pdf += f"{off:010d} 00000 n \n".encode()
    pdf += (
        b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R >>\n"
        b"startxref\n" + str(xref_offset).encode() + b"\n%%EOF"
    )
    return pdf


def test_validate_row_debit_maps_to_expense():
    row = {"date": "2026-01-15", "description": "NETFLIX.COM", "amount": 15.99, "direction": "debit", "category": "entertainment"}
    normalized = _validate_row(row)
    assert normalized["entry_type"] == "expense"
    assert normalized["category"] == "entertainment"
    assert normalized["amount"] == 15.99
    assert normalized["entry_date"] == date(2026, 1, 15)


def test_validate_row_credit_maps_to_income():
    row = {"date": "2026-01-01", "description": "Paycheck", "amount": 3000, "direction": "credit", "category": "paycheck"}
    normalized = _validate_row(row)
    assert normalized["entry_type"] == "income"
    assert normalized["category"] == "paycheck"


def test_validate_row_rejects_category_from_wrong_direction():
    # "paycheck" is an income category, not valid for a debit/expense row
    row = {"date": "2026-01-15", "amount": 10, "direction": "debit", "category": "paycheck"}
    with pytest.raises(ValueError):
        _validate_row(row)


def test_validate_row_rejects_invalid_direction():
    with pytest.raises(ValueError):
        _validate_row({"date": "2026-01-15", "amount": 10, "direction": "sideways", "category": "food"})


def test_validate_row_rejects_zero_amount():
    with pytest.raises(ValueError):
        _validate_row({"date": "2026-01-15", "amount": 0, "direction": "debit", "category": "food"})


def test_validate_row_recurring_guess_defaults_to_monthly_frequency():
    row = {"date": "2026-01-15", "amount": 15.99, "direction": "debit", "category": "entertainment", "is_recurring_guess": True}
    normalized = _validate_row(row)
    assert normalized["is_recurring"] is True
    assert normalized["recurring_frequency"] == "monthly"


def test_validate_row_non_recurring_has_no_frequency():
    row = {"date": "2026-01-15", "amount": 15.99, "direction": "debit", "category": "food"}
    normalized = _validate_row(row)
    assert normalized["is_recurring"] is False
    assert normalized["recurring_frequency"] is None


def test_validate_row_defaults_missing_date_to_today():
    row = {"amount": 10, "direction": "debit", "category": "food"}
    normalized = _validate_row(row)
    assert normalized["entry_date"] == date.today()


def test_extract_statement_text_reads_csv():
    csv_bytes = b"Date,Description,Amount\n2026-01-15,NETFLIX.COM,15.99\n"
    text = extract_statement_text(csv_bytes, "statement.csv")
    assert "NETFLIX.COM" in text
    assert "15.99" in text


def test_extract_statement_text_reads_pdf():
    pdf_bytes = _minimal_pdf(["Date,Description,Amount", "2026-01-15,NETFLIX.COM,15.99"])
    text = extract_statement_text(pdf_bytes, "statement.pdf")
    assert "NETFLIX.COM" in text
    assert "15.99" in text


def test_confirm_bank_import_skips_invalid_rows_but_writes_valid_ones(monkeypatch):
    created = []

    class FakeSession:
        def add(self, obj):
            created.append(obj)

        def commit(self):
            pass

    monkeypatch.setattr("backend.bank_import_service.db.session", FakeSession())

    rows = [
        {"date": "2026-01-15", "amount": 15.99, "direction": "debit", "category": "entertainment", "description": "Netflix"},
        {"date": "2026-01-16", "amount": 0, "direction": "debit", "category": "food"},  # invalid: zero amount
    ]
    result = confirm_bank_import(rows, user_id="test-user", household_id=None, currency="USD")

    assert result["entries_created"] == 1
    assert len(result["errors"]) == 1
    assert len(created) == 1
    assert created[0].category == "entertainment"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
