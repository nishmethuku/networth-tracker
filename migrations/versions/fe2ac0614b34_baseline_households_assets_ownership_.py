"""baseline: households, assets ownership, snapshots

This revision marks the Alembic baseline. The actual initial schema
(tables, RLS policies, triggers, cross-schema FK to auth.users) was applied
directly via supabase/migrations/0001_init.sql, which SQLAlchemy's
autogenerate can't fully describe (check constraints, partial unique
indexes, and the auth.users foreign key aren't modeled in models.py).
This migration is intentionally a no-op — it exists only so `flask db
stamp head` gives Alembic a known starting point for future migrations.

Revision ID: fe2ac0614b34
Revises:
Create Date: 2026-08-12 18:01:28.799106

"""

# revision identifiers, used by Alembic.
revision = 'fe2ac0614b34'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
