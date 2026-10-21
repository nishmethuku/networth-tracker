-- 0005_soft_delete.sql
-- Add deleted_at to holdings, holding_transactions, and accounts so that
-- deletes are reversible. NULL means live; a timestamp means soft-deleted.
-- All application queries must filter WHERE deleted_at IS NULL.

ALTER TABLE public.holdings
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.holding_transactions
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial indexes so the common "live rows only" query path stays fast.
CREATE INDEX IF NOT EXISTS holdings_live_idx
    ON public.holdings (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS holding_transactions_live_idx
    ON public.holding_transactions (holding_id)
    WHERE deleted_at IS NULL;
