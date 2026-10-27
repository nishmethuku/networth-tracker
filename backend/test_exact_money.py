"""Money columns are exact decimals, and the migration that made them so is wired in correctly."""
import importlib.util
import pathlib

from sqlalchemy import Numeric

from backend import models

EXPECTED = {
    "holdings": {"sip_amount": (18, 4)},
    "holding_transactions": {"quantity": (24, 8), "price_per_unit": (24, 8), "fees": (18, 4)},
    "holding_valuations": {"value": (18, 4)},
    "price_history": {"price": (24, 8)},
    "net_worth_snapshots": {
        "total_net_worth": (18, 4),
        "total_stock_value": (18, 4),
        "total_property_value": (18, 4),
        "total_profit_loss": (18, 4),
        "total_liabilities": (18, 4),
    },
    "budget_entries": {"amount": (18, 4)},
    "budget_limits": {"monthly_limit": (18, 4)},
    "goals": {"target_amount": (18, 4)},
    "liabilities": {"current_balance": (18, 4), "original_amount": (18, 4), "monthly_payment": (18, 4)},
}


def test_money_columns_are_exact_numerics():
    tables = models.db.metadata.tables
    for table, cols in EXPECTED.items():
        for col, (p, s) in cols.items():
            t = tables[table].c[col].type
            assert isinstance(t, Numeric), f"{table}.{col}"
            assert (t.precision, t.scale) == (p, s), f"{table}.{col}"
            assert t.asdecimal is False, f"{table}.{col} must still hand plain floats to the app"


def test_rates_stay_floats():
    tables = models.db.metadata.tables
    assert type(tables["liabilities"].c["interest_rate"].type).__name__ == "Float"
    assert type(tables["holdings"].c["interest_rate"].type).__name__ == "Float"


def test_migration_matches_models():
    path = next(pathlib.Path("migrations/versions").glob("e7b1c4a98d32_*.py"))
    spec = importlib.util.spec_from_file_location("m", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert m.down_revision == "d5a9e3c71f20"
    assert {(t, c): (p, s) for t, c, p, s in m.COLUMNS} == {(t, c): ps for t, cols in EXPECTED.items() for c, ps in cols.items()}
