"""price_history unique key includes currency

Revision ID: 12cb548a4a40
Revises: c8e2f5a91d36
Create Date: 2026-09-09 16:35:00.000000

price_history's unique key was (asset_type, symbol, price_date), with no
currency -- fine for stock/mutual_fund (always priced in their one home
exchange currency), but crypto/commodity prices are fetched and cached
per requested currency (see price_service.get_current_price/
get_historical_price). With only one row allowed per (asset_type, symbol,
price_date), caching a crypto/commodity price in one currency silently
overwrote (or was read back as) a price cached in another currency for
the same symbol/day -- a user pricing bitcoin in INR could get served a
USD-denominated row (or vice versa), off by the exchange rate. No
existing rows can violate the new, more permissive constraint (it was
already unique on the old, narrower key), so this is a same-day,
no-cleanup migration.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '12cb548a4a40'
down_revision = 'c8e2f5a91d36'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('price_history_asset_type_symbol_price_date_key', 'price_history', type_='unique')
    op.create_unique_constraint(
        'price_history_asset_type_symbol_price_date_currency_key',
        'price_history',
        ['asset_type', 'symbol', 'price_date', 'currency'],
    )


def downgrade():
    op.drop_constraint('price_history_asset_type_symbol_price_date_currency_key', 'price_history', type_='unique')
    op.create_unique_constraint(
        'price_history_asset_type_symbol_price_date_key',
        'price_history',
        ['asset_type', 'symbol', 'price_date'],
    )
