"""add retirals and credit asset types

Revision ID: e30e24d8f09a
Revises: d07d1354bb21
Create Date: 2026-08-19 14:22:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e30e24d8f09a'
down_revision = 'd07d1354bb21'
branch_labels = None
depends_on = None

OLD_TYPES = "'stock', 'mutual_fund', 'crypto', 'commodity', 'real_estate', 'fixed_deposit', 'ppf', 'epf', 'cash', 'loan'"
NEW_TYPES = OLD_TYPES + ", 'retirals', 'credit'"


def upgrade():
    # holdings.asset_type has a hand-written CHECK constraint from the
    # original supabase/migrations/0002_holdings.sql (predates Flask-Migrate
    # tracking this table) — drop and recreate it with the two new values.
    op.drop_constraint('holdings_asset_type_check', 'holdings', type_='check')
    op.create_check_constraint('holdings_asset_type_check', 'holdings', f"asset_type IN ({NEW_TYPES})")


def downgrade():
    op.drop_constraint('holdings_asset_type_check', 'holdings', type_='check')
    op.create_check_constraint('holdings_asset_type_check', 'holdings', f"asset_type IN ({OLD_TYPES})")
