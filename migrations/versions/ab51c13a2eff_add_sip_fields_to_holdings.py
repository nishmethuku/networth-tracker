"""add SIP fields to holdings

Revision ID: ab51c13a2eff
Revises: 71623b33aeba
Create Date: 2026-08-13 17:53:14.042993

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ab51c13a2eff'
down_revision = '71623b33aeba'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('holdings', sa.Column('sip_amount', sa.Float(), nullable=True))
    op.add_column('holdings', sa.Column('sip_frequency', sa.String(length=16), nullable=True))
    op.add_column('holdings', sa.Column('sip_start_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('holdings', 'sip_start_date')
    op.drop_column('holdings', 'sip_frequency')
    op.drop_column('holdings', 'sip_amount')
