-- Monthly payment amount and next payment due date on liabilities.
-- Both nullable so existing rows are unaffected.
ALTER TABLE public.liabilities
  ADD COLUMN IF NOT EXISTS monthly_payment DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;
