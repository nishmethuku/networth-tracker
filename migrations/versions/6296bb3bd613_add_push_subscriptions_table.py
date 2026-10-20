"""add push_subscriptions table

Revision ID: 6296bb3bd613
Revises: 12cb548a4a40
Create Date: 2026-10-20 09:25:48.112626

Hand-trimmed from Alembic's autogenerate output, which also picked up a
long tail of unrelated pre-existing drift between models.py and the real
schema (see the baseline migration's own docstring for why that drift
exists and is expected) -- this migration does only the one thing its
name says.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '6296bb3bd613'
down_revision = '12cb548a4a40'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint'),
    )
    op.create_index('push_subscriptions_user_id_idx', 'push_subscriptions', ['user_id'])


def downgrade():
    op.drop_index('push_subscriptions_user_id_idx', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
