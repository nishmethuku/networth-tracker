"""Linked bank or broker connections, and an external id on budget entries.

Revision ID: f3c8a1d57b29
Revises: e7b1c4a98d32
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f3c8a1d57b29"
down_revision = "e7b1c4a98d32"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("budget_entries", sa.Column("external_id", sa.String(length=128), nullable=True))
    op.create_index(
        "budget_entries_user_external_uidx",
        "budget_entries",
        ["user_id", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )
    op.create_table(
        "linked_connections",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id"), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False, server_default="bank"),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("institution_name", sa.String(length=128)),
        sa.Column("access_token_enc", sa.Text()),
        sa.Column("cursor", sa.Text()),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("linked_connections_user_idx", "linked_connections", ["user_id"])


def downgrade():
    op.drop_index("linked_connections_user_idx", table_name="linked_connections")
    op.drop_table("linked_connections")
    op.drop_index("budget_entries_user_external_uidx", table_name="budget_entries")
    op.drop_column("budget_entries", "external_id")
