"""add remittances (money sent to family abroad) and goals.saved_amount (savings goals)

Revision ID: e2b7d4a91c58
Revises: a9c4e1b27d35
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e2b7d4a91c58"
down_revision = "a9c4e1b27d35"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "remittances",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sent_date", sa.Date(), nullable=False),
        sa.Column("recipient", sa.String(length=80), nullable=False),
        sa.Column("provider", sa.String(length=60)),
        sa.Column("amount_sent", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency_sent", sa.String(length=8), nullable=False),
        sa.Column("amount_received", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency_received", sa.String(length=8), nullable=False),
        sa.Column("fee", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("note", sa.String(length=200)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_remittances_user_id", "remittances", ["user_id"])
    op.add_column("goals", sa.Column("saved_amount", sa.Numeric(18, 4), nullable=True))


def downgrade():
    op.drop_column("goals", "saved_amount")
    op.drop_index("ix_remittances_user_id", table_name="remittances")
    op.drop_table("remittances")
