"""add account_transfers (a record of money moved between two cash accounts)

Revision ID: c6f2a8b4d915
Revises: b5e1f9a3c724
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c6f2a8b4d915"
down_revision = "b5e1f9a3c724"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "account_transfers",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_holding_id", sa.BigInteger(), sa.ForeignKey("holdings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_holding_id", sa.BigInteger(), sa.ForeignKey("holdings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("from_name", sa.String(length=128), nullable=False),
        sa.Column("to_name", sa.String(length=128), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=200)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_account_transfers_user_id", "account_transfers", ["user_id"])


def downgrade():
    op.drop_index("ix_account_transfers_user_id", table_name="account_transfers")
    op.drop_table("account_transfers")
