"""add automatic monthly update fields to liabilities (EMI method)

Revision ID: d7a3b9c2e016
Revises: c6f2a8b4d915
"""
import sqlalchemy as sa
from alembic import op

revision = "d7a3b9c2e016"
down_revision = "c6f2a8b4d915"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("liabilities", sa.Column("auto_update", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("liabilities", sa.Column("remaining_months", sa.Integer(), nullable=True))
    op.add_column("liabilities", sa.Column("next_auto_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("liabilities", "next_auto_date")
    op.drop_column("liabilities", "remaining_months")
    op.drop_column("liabilities", "auto_update")
