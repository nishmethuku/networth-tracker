"""add budget_categories table

Revision ID: b3f6a1d84c72
Revises: e2b8c4a71f95
Create Date: 2026-08-26 18:00:00.000000

User-defined income/expense categories alongside the fixed preset list in
budget_service.py. Same household-sharing shape as budget_limits (owner/
editor required to write into a shared household, RLS mirrors it exactly),
so this closes the same gap for any client connecting as `authenticated`
directly rather than through Flask -- see a4c8f1e29d67 for the reasoning.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b3f6a1d84c72'
down_revision = 'e2b8c4a71f95'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'budget_categories',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('entry_type', sa.String(length=8), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('budget_categories_user_idx', 'budget_categories', ['user_id'])
    op.create_index('budget_categories_household_idx', 'budget_categories', ['household_id'])

    op.execute("alter table public.budget_categories enable row level security;")
    op.execute("""
        create policy budget_categories_select on public.budget_categories
          for select using (
            user_id = auth.uid()
            or household_id in (select household_id from public.household_members where user_id = auth.uid())
          );
    """)
    op.execute("""
        create policy budget_categories_insert on public.budget_categories
          for insert with check (
            user_id = auth.uid()
            and (
              household_id is null
              or household_id in (
                select household_id from public.household_members
                where user_id = auth.uid() and role in ('owner', 'editor')
              )
            )
          );
    """)
    op.execute("""
        create policy budget_categories_delete on public.budget_categories
          for delete using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)


def downgrade():
    for policy in ('budget_categories_select', 'budget_categories_insert', 'budget_categories_delete'):
        op.execute(f"drop policy if exists {policy} on public.budget_categories;")
    op.execute("alter table public.budget_categories disable row level security;")
    op.drop_index('budget_categories_household_idx', table_name='budget_categories')
    op.drop_index('budget_categories_user_idx', table_name='budget_categories')
    op.drop_table('budget_categories')
