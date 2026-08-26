"""
Unit tests for the CSV backup export's row-to-CSV formatting. The full
export_user_data_csv_zip flow (DB queries + zip assembly) is covered by a
live end-to-end check instead, since it needs an app/DB context.
"""
import csv
import inspect
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/fake")

from backend import account_service, models
from backend.account_service import _write_csv

# Deliberately not covered by export_user_data/delete_all_user_data, with
# the reason why -- everything else with a user_id column is expected to
# appear in both functions' source.
EXEMPT_MODEL_NAMES = {
    # Membership, not financial data -- handled by household_service's own
    # leave/remove flow instead.
    "HouseholdMember",
}
# Deliberately not covered by delete_all_user_data specifically (still
# expected in export_user_data) -- they cascade-delete at the DB level via
# their ON DELETE CASCADE FK to holdings when the parent Holding row is
# deleted, so the function never references them by name at all. See
# delete_all_user_data's docstring.
DELETE_EXEMPT_MODEL_NAMES = {"HoldingTransaction", "HoldingValuation"}


def _parse(csv_text):
    return list(csv.DictReader(io.StringIO(csv_text)))


def test_write_csv_empty_list_is_empty_string():
    assert _write_csv([]) == ""


def test_write_csv_basic_rows():
    rows = [{"id": 1, "name": "AAPL"}, {"id": 2, "name": "BTC"}]
    parsed = _parse(_write_csv(rows))
    assert parsed == [{"id": "1", "name": "AAPL"}, {"id": "2", "name": "BTC"}]


def test_export_and_delete_reference_every_user_owned_model():
    """Regression: BudgetCategory carries a user_id column like every other
    piece of financial data, but was never added to export_user_data or
    delete_all_user_data when it shipped -- "export my data" silently
    omitted it and "delete all my data" silently left it behind, directly
    contradicting delete_all_user_data's own docstring ("every table
    export_user_data() reports, so delete all my data actually leaves
    nothing behind"). Both functions are simple flat sequences of
    Model.query...  calls rather than a loop (unlike household_service's
    unshare loop), so this checks the model name literally appears in each
    function's source rather than tracing execution -- cheaper, and still
    catches a model that was never wired in at all, which is exactly how
    this gap happened."""
    user_owned_model_names = {
        mapper.class_.__name__ for mapper in models.db.Model.registry.mappers if hasattr(mapper.class_, "user_id")
    }
    expected = user_owned_model_names - EXEMPT_MODEL_NAMES

    export_src = inspect.getsource(account_service.export_user_data)
    delete_src = inspect.getsource(account_service.delete_all_user_data)

    missing_from_export = {name for name in expected if name not in export_src}
    missing_from_delete = {name for name in (expected - DELETE_EXEMPT_MODEL_NAMES) if name not in delete_src}

    assert not missing_from_export, f"Not referenced in export_user_data: {missing_from_export}"
    assert not missing_from_delete, f"Not referenced in delete_all_user_data: {missing_from_delete}"


def test_write_csv_uses_union_of_keys_across_heterogeneous_rows():
    # A stock holding and a cash holding don't share every field (e.g.
    # quantity vs no quantity) — the header must cover both without erroring.
    rows = [
        {"id": 1, "asset_type": "stock", "quantity": 10},
        {"id": 2, "asset_type": "cash"},
    ]
    text = _write_csv(rows)
    header = text.splitlines()[0]
    assert "quantity" in header
    parsed = _parse(text)
    assert parsed[1]["quantity"] == ""  # missing field renders as blank, not an error
