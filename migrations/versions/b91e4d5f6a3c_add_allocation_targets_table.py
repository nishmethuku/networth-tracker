"""add allocation_targets table

Revision ID: b91e4d5f6a3c
Revises: a7f3c2e91b4d
Create Date: 2026-08-24 13:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b91e4d5f6a3c'
down_revision = 'a7f3c2e91b4d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'allocation_targets',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('asset_type', sa.String(length=32), nullable=False),
        sa.Column('target_pct', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'asset_type', name='allocation_targets_user_asset_type_key'),
    )
    op.create_index('allocation_targets_user_id_idx', 'allocation_targets', ['user_id'])


def downgrade():
    op.drop_index('allocation_targets_user_id_idx', table_name='allocation_targets')
    op.drop_table('allocation_targets')
