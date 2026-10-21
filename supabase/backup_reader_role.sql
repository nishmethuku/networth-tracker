-- Run this in the Supabase SQL editor (Dashboard → SQL Editor) while connected
-- as the postgres role (the default connection in the editor).
-- Replace 'choose-a-strong-password' with an actual password before running.
-- After running, use the resulting credentials for PG_BACKUP_URL instead of
-- the service role key.

-- ─── Option A: BYPASSRLS (preferred) ──────────────────────────────────────
-- Supabase's postgres role is a superuser and can grant BYPASSRLS.
-- Try this first; if it errors with "must be superuser", use Option B.

CREATE ROLE backup_reader WITH LOGIN PASSWORD 'choose-a-strong-password' BYPASSRLS;
GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
-- Let backup_reader see future tables without re-running this script.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;


-- ─── Option B: Per-table RLS policies (fallback) ──────────────────────────
-- Use only if Option A errored. Comment out Option A above and uncomment
-- everything below.

-- CREATE ROLE backup_reader WITH LOGIN PASSWORD 'choose-a-strong-password';
-- GRANT USAGE ON SCHEMA public TO backup_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
--
-- The tables below have RLS enabled.  The USING (true) policy lets backup_reader
-- read every row regardless of user_id, which is what pg_dump needs.
-- CREATE POLICY backup_reader_select ON public.holdings
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.holding_transactions
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.accounts
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.net_worth_snapshots
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.milestones
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.price_alerts
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.liabilities
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.goals
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.allocation_targets
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.budget_entries
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.budget_limits
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.budget_categories
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.push_subscriptions
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.email_unsubscribes
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.household_members
--     FOR SELECT TO backup_reader USING (true);
-- CREATE POLICY backup_reader_select ON public.household_invites
--     FOR SELECT TO backup_reader USING (true);


-- ─── After running either option ──────────────────────────────────────────
-- Set PG_BACKUP_URL in Render to:
--   postgresql://backup_reader:<password>@<host>:<port>/<db>
-- The host/port/db come from Supabase Dashboard → Settings → Database → Connection string.
-- Use the "Session mode" (port 5432) string, not the transaction pooler (6543).
-- The service role key is no longer needed for backups.
