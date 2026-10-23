"""add rollover to budget_limits

Revision ID: d5a9e3c71f20
Revises: c1f7a2d83e46
Create Date: 2026-10-23 00:00:00.000000

A limit can carry last month's unspent amount into the current month.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd5a9e3c71f20'
down_revision = 'c1f7a2d83e46'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'budget_limits',
        sa.Column('rollover', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column('budget_limits', 'rollover')
