"""add accounts table

Revision ID: c8e2f5a91d36
Revises: b3f6a1d84c72
Create Date: 2026-08-30 17:00:00.000000

User-registered account names (a brokerage, a bank account, a person's
name), separate from Holding.account actually being used by anything yet.
Same household-sharing shape as budget_categories, RLS mirrors it exactly
-- see a4c8f1e29d67 for the reasoning.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'c8e2f5a91d36'
down_revision = 'b3f6a1d84c72'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'accounts',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('accounts_user_idx', 'accounts', ['user_id'])
    op.create_index('accounts_household_idx', 'accounts', ['household_id'])

    op.execute("alter table public.accounts enable row level security;")
    op.execute("""
        create policy accounts_select on public.accounts
          for select using (
            user_id = auth.uid()
            or household_id in (select household_id from public.household_members where user_id = auth.uid())
          );
    """)
    op.execute("""
        create policy accounts_insert on public.accounts
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
        create policy accounts_delete on public.accounts
          for delete using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)


def downgrade():
    for policy in ('accounts_select', 'accounts_insert', 'accounts_delete'):
        op.execute(f"drop policy if exists {policy} on public.accounts;")
    op.execute("alter table public.accounts disable row level security;")
    op.drop_index('accounts_household_idx', table_name='accounts')
    op.drop_index('accounts_user_idx', table_name='accounts')
    op.drop_table('accounts')
