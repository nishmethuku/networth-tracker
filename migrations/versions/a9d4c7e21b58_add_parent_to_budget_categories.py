"""add parent to budget_categories

Revision ID: a9d4c7e21b58
Revises: 6296bb3bd613
Create Date: 2026-10-22 00:00:00.000000

Lets a custom Budget category sit inside another category (for example
"Cellphone" inside "Utilities"). The parent is stored by name, because
Budget entries also store category names as plain strings. One level only.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a9d4c7e21b58'
down_revision = '6296bb3bd613'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('budget_categories', sa.Column('parent', sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column('budget_categories', 'parent')
