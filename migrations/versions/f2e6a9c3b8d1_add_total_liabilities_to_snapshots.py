"""add total_liabilities to net_worth_snapshots

Revision ID: f2e6a9c3b8d1
Revises: c4a8f1e2d5b7
Create Date: 2026-08-24 20:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2e6a9c3b8d1'
down_revision = 'c4a8f1e2d5b7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'net_worth_snapshots',
        sa.Column('total_liabilities', sa.Float(), nullable=False, server_default='0'),
    )


def downgrade():
    op.drop_column('net_worth_snapshots', 'total_liabilities')
