"""add RLS policies for goals, allocation_targets, liabilities, budget_entries, budget_limits

Revision ID: a4c8f1e29d67
Revises: f2e6a9c3b8d1
Create Date: 2026-08-25 00:00:00.000000

Defense-in-depth parity with the original supabase/migrations/*.sql tables
(holdings, holding_transactions, holding_valuations, price_alerts,
milestones, ...) — these five tables were added later via Flask-Migrate and
never got RLS policies, even though Flask's own service_role connection
bypasses RLS regardless (the real authorization boundary is
backend/auth.py's require_auth + the app's own query scoping, see README).
This closes the gap for any future client that connects as `authenticated`
directly rather than through Flask.

goals and allocation_targets have no household_id column (user-only, never
shared) so their policies are a straightforward owner-only check. liabilities
and budget_entries mirror the holdings_* policies exactly (household_id +
is_private, editor/owner required to write). budget_limits mirrors the same
household-sharing shape but has no is_private column.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a4c8f1e29d67'
down_revision = 'f2e6a9c3b8d1'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("alter table public.goals enable row level security;")
    op.execute("""
        create policy goals_all on public.goals
          for all using (user_id = auth.uid())
          with check (user_id = auth.uid());
    """)

    op.execute("alter table public.allocation_targets enable row level security;")
    op.execute("""
        create policy allocation_targets_all on public.allocation_targets
          for all using (user_id = auth.uid())
          with check (user_id = auth.uid());
    """)

    op.execute("alter table public.liabilities enable row level security;")
    op.execute("""
        create policy liabilities_select on public.liabilities
          for select using (
            user_id = auth.uid()
            or (
              is_private = false
              and household_id in (select household_id from public.household_members where user_id = auth.uid())
            )
          );
    """)
    op.execute("""
        create policy liabilities_insert on public.liabilities
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
        create policy liabilities_update on public.liabilities
          for update using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)
    op.execute("""
        create policy liabilities_delete on public.liabilities
          for delete using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)

    op.execute("alter table public.budget_entries enable row level security;")
    op.execute("""
        create policy budget_entries_select on public.budget_entries
          for select using (
            user_id = auth.uid()
            or (
              is_private = false
              and household_id in (select household_id from public.household_members where user_id = auth.uid())
            )
          );
    """)
    op.execute("""
        create policy budget_entries_insert on public.budget_entries
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
        create policy budget_entries_update on public.budget_entries
          for update using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)
    op.execute("""
        create policy budget_entries_delete on public.budget_entries
          for delete using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)

    op.execute("alter table public.budget_limits enable row level security;")
    op.execute("""
        create policy budget_limits_select on public.budget_limits
          for select using (
            user_id = auth.uid()
            or household_id in (select household_id from public.household_members where user_id = auth.uid())
          );
    """)
    op.execute("""
        create policy budget_limits_insert on public.budget_limits
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
        create policy budget_limits_update on public.budget_limits
          for update using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)
    op.execute("""
        create policy budget_limits_delete on public.budget_limits
          for delete using (
            user_id = auth.uid()
            or household_id in (
              select household_id from public.household_members
              where user_id = auth.uid() and role in ('owner', 'editor')
            )
          );
    """)


def downgrade():
    for table, policies in [
        ("goals", ["goals_all"]),
        ("allocation_targets", ["allocation_targets_all"]),
        ("liabilities", ["liabilities_select", "liabilities_insert", "liabilities_update", "liabilities_delete"]),
        ("budget_entries", ["budget_entries_select", "budget_entries_insert", "budget_entries_update", "budget_entries_delete"]),
        ("budget_limits", ["budget_limits_select", "budget_limits_insert", "budget_limits_update", "budget_limits_delete"]),
    ]:
        for policy in policies:
            op.execute(f"drop policy if exists {policy} on public.{table};")
        op.execute(f"alter table public.{table} disable row level security;")
