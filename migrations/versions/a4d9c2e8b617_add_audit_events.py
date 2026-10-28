"""add audit_events (security activity log)

Revision ID: a4d9c2e8b617
Revises: f3c8a1d57b29
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a4d9c2e8b617"
down_revision = "f3c8a1d57b29"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("detail", sa.String(length=200)),
        sa.Column("ip", sa.String(length=45)),
        sa.Column("user_agent", sa.String(length=200)),
        sa.Column("request_id", sa.String(length=64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("audit_events_user_created_idx", "audit_events", ["user_id", "created_at"])


def downgrade():
    op.drop_index("audit_events_user_created_idx", table_name="audit_events")
    op.drop_table("audit_events")
