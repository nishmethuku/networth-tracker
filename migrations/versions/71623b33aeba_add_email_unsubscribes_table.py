"""add email_unsubscribes table

Revision ID: 71623b33aeba
Revises: ef84aafcd23c
Create Date: 2026-08-13 17:04:49.115961

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '71623b33aeba'
down_revision = 'ef84aafcd23c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'email_unsubscribes',
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('unsubscribed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('email'),
    )


def downgrade():
    op.drop_table('email_unsubscribes')
