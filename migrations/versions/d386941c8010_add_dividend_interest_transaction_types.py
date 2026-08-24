"""add dividend and interest transaction types

Revision ID: d386941c8010
Revises: e30e24d8f09a
Create Date: 2026-08-24 12:55:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'd386941c8010'
down_revision = 'e30e24d8f09a'
branch_labels = None
depends_on = None

OLD_TYPES = "'buy', 'sell'"
NEW_TYPES = OLD_TYPES + ", 'dividend', 'interest'"


def upgrade():
    # holding_transactions.transaction_type has a hand-written CHECK
    # constraint from the original supabase/migrations/0002_holdings.sql
    # (predates Flask-Migrate tracking this table) — drop and recreate it
    # with the two new values, same pattern as e30e24d8f09a for asset_type.
    op.drop_constraint('holding_transactions_transaction_type_check', 'holding_transactions', type_='check')
    op.create_check_constraint('holding_transactions_transaction_type_check', 'holding_transactions', f"transaction_type IN ({NEW_TYPES})")


def downgrade():
    op.drop_constraint('holding_transactions_transaction_type_check', 'holding_transactions', type_='check')
    op.create_check_constraint('holding_transactions_transaction_type_check', 'holding_transactions', f"transaction_type IN ({OLD_TYPES})")
