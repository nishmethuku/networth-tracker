# Plan: exact decimals for money columns

Status: proposal, nothing has been changed yet.

## What the problem is

Money and quantities are stored as `Float` (a binary floating point number). A computer cannot store values such as 0.1 exactly in that format, so tiny errors appear, for example `0.1 + 0.2` gives `0.30000000000000004`. The database type `NUMERIC` stores decimal digits exactly.

## How much does it matter here

Honestly, for one person tracking a portfolio, not much. A double precision number is accurate to about 15 significant digits, the app rounds to cents for display, and the daily snapshot job rounds totals to 2 decimals. The realistic risks are small:

- Totals that differ by a cent between two screens that add numbers in a different order.
- Equality checks on money (for example "balance is exactly zero") that fail because of a leftover 1e-12.
- Quantities of crypto with many decimals losing their last digits.

So this is hygiene, not a bug fix. It is worth doing only if it can be done safely and cheaply, which the phased approach below aims for.

## Which columns

Money and quantity columns that should become `NUMERIC`:

| Table | Column | Suggested type |
|---|---|---|
| holding_transactions | quantity | NUMERIC(24, 8) |
| holding_transactions | price_per_unit | NUMERIC(24, 8) |
| holding_transactions | fees | NUMERIC(18, 4) |
| holding_valuations | value | NUMERIC(18, 4) |
| price_history | price | NUMERIC(24, 8) |
| net_worth_snapshots | total_net_worth, total_stock_value, total_property_value, total_profit_loss, total_liabilities | NUMERIC(18, 4) |
| budget_entries | amount | NUMERIC(18, 4) |
| budget_limits | monthly_limit | NUMERIC(18, 4) |
| goals | target_amount | NUMERIC(18, 4) |
| liabilities | current_balance, original_amount, monthly_payment | NUMERIC(18, 4) |
| holdings | sip_amount | NUMERIC(18, 4) |

Columns that should stay `Float` because they are ratios, not money: interest rates, exchange rates, allocation target percentages, alert thresholds.

## Phase 1: exact storage, no code change in the app

Change only the database type, and tell SQLAlchemy to keep handing the app plain Python floats:

```python
quantity = db.Column(db.Numeric(24, 8, asdecimal=False), nullable=False)
```

Because `asdecimal=False` returns floats, no calculation, JSON response or test has to change. The database now holds exact decimal values, and rounding happens once, at write time.

The migration for each table is one statement:

```sql
ALTER TABLE holding_transactions
  ALTER COLUMN quantity TYPE NUMERIC(24, 8) USING ROUND(quantity::numeric, 8);
```

Steps:

1. Take a database backup (Supabase point-in-time recovery or a manual dump) and write down the row counts and a checksum such as `SUM(quantity)` per table.
2. Run the migration on a copy of the database first (a Supabase branch), then compare the checksums. Expect differences only below the 8th decimal.
3. Deploy the model change and the migration together. The app stays online; `ALTER COLUMN TYPE` rewrites the table and holds a lock, which is a fraction of a second at this size.
4. Compare the checksums again and open the Dashboard, Portfolio and Budget pages.

Rollback: the reverse `ALTER ... TYPE DOUBLE PRECISION` is lossless for these values, and the backup covers everything else.

## Phase 2 (optional): Decimal in money math

Only if phase 1 is not enough. Switch `asdecimal=True` for the columns used in totals (`finance.py`, `snapshot_service.py`, `liability_service.py`), convert to `Decimal` at the edge of each calculation, and convert back to a number when building JSON. This touches many files and every test that compares floats, so it should be done one module at a time.

## Tests to add before starting

- A test that stores `0.1 + 0.2` as a transaction price and reads back exactly `0.3` after phase 1.
- A test that a quantity with 8 decimals (0.00000001 BTC) survives a save and a read.
- A migration test that runs upgrade then downgrade on a scratch database.

## Recommendation

Do phase 1 on a branch of the database when convenient, because it is cheap and reversible. Skip phase 2 unless a real rounding bug shows up.
