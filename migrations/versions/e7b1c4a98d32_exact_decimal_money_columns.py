"""Store money columns as exact decimals instead of floats.

Revision ID: e7b1c4a98d32
Revises: d5a9e3c71f20
"""
from alembic import op

revision = "e7b1c4a98d32"
down_revision = "d5a9e3c71f20"
branch_labels = None
depends_on = None

# (table, column, precision, scale)
COLUMNS = [
    ("holdings", "sip_amount", 18, 4),
    ("holding_transactions", "quantity", 24, 8),
    ("holding_transactions", "price_per_unit", 24, 8),
    ("holding_transactions", "fees", 18, 4),
    ("holding_valuations", "value", 18, 4),
    ("price_history", "price", 24, 8),
    ("net_worth_snapshots", "total_net_worth", 18, 4),
    ("net_worth_snapshots", "total_stock_value", 18, 4),
    ("net_worth_snapshots", "total_property_value", 18, 4),
    ("net_worth_snapshots", "total_profit_loss", 18, 4),
    ("net_worth_snapshots", "total_liabilities", 18, 4),
    ("budget_entries", "amount", 18, 4),
    ("budget_limits", "monthly_limit", 18, 4),
    ("goals", "target_amount", 18, 4),
    ("liabilities", "current_balance", 18, 4),
    ("liabilities", "original_amount", 18, 4),
    ("liabilities", "monthly_payment", 18, 4),
]


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, col, p, s in COLUMNS:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {col} TYPE NUMERIC({p},{s}) "
            f"USING ROUND({col}::numeric, {s})"
        )


def downgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    for table, col, _p, _s in COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE DOUBLE PRECISION USING {col}::double precision")
