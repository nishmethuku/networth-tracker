"""add budget_category_seeds (default categories become editable rows)

Revision ID: b5e1f9a3c724
Revises: a4d9c2e8b617
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b5e1f9a3c724"
down_revision = "a4d9c2e8b617"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "budget_category_seeds",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=True),
        sa.Column("scope_key", sa.String(length=64), nullable=False),
        sa.Column("entry_type", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("scope_key", "entry_type", name="budget_category_seeds_scope_type_uq"),
    )


def downgrade():
    op.drop_table("budget_category_seeds")
