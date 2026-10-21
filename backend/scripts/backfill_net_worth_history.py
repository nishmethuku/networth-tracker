"""
Rebuild past net worth for one user from their recorded transactions and
valuations plus historical prices and exchange rates, and save one snapshot
per month (the 1st) for dates that do not already have one.

SAFE BY DEFAULT: without --apply this only prints what it would write. It
never overwrites an existing snapshot, skips any date it cannot fully price,
and refuses to run for a user who has liabilities (it does not reconstruct
past debt balances, so the numbers would be overstated).

Usage (from the repo root, with DATABASE_URL set):
  PYTHONPATH=. python -m backend.scripts.backfill_net_worth_history --user-id <uuid>
  PYTHONPATH=. python -m backend.scripts.backfill_net_worth_history --user-id <uuid> --apply
"""
import argparse
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend import price_service
from backend.app import create_app
from backend.history_backfill import (
    HoldingRecord,
    earliest_activity,
    month_starts,
    reconstruct_series,
)
from backend.models import Holding, HoldingTransaction, HoldingValuation, Liability, NetWorthSnapshot, db


def _price_fn(asset_type, symbol, on_date):
    # Stocks/funds are priced in their home exchange's currency; crypto and
    # commodities are requested in USD directly (see price_service).
    home = price_service.price_home_currency(asset_type, symbol)
    price_currency = home or "USD"
    price = price_service.get_historical_price(asset_type, symbol, on_date, currency=price_currency)
    return (price, price_currency) if price is not None else None


def _rate_fn(from_currency, to_currency, on_date):
    return price_service.get_rate(from_currency, to_currency, on_date)


def load_records(user_id):
    holdings = Holding.query.filter(Holding.user_id == user_id, Holding.deleted_at.is_(None)).all()
    records = []
    for h in holdings:
        txs = HoldingTransaction.query.filter(
            HoldingTransaction.holding_id == h.id, HoldingTransaction.deleted_at.is_(None)
        ).all()
        vals = HoldingValuation.query.filter(HoldingValuation.holding_id == h.id).all()
        records.append(
            HoldingRecord(
                asset_type=h.asset_type,
                symbol=h.symbol,
                currency=h.currency,
                transactions=[(t.transaction_date, t.transaction_type, t.quantity) for t in txs],
                valuations=[(v.valuation_date, v.value, v.currency) for v in vals],
            )
        )
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--apply", action="store_true", help="actually write snapshots (default: dry run)")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if Liability.query.filter(Liability.user_id == args.user_id).count() > 0:
            print("This user has liabilities, and past debt balances are not reconstructed, so the rebuilt numbers")
            print("would be overstated. Not running.")
            return 1

        records = load_records(args.user_id)
        first = earliest_activity(records)
        if first is None:
            print("Nothing recorded for this user, nothing to rebuild.")
            return 0

        existing = {
            s.snapshot_date
            for s in NetWorthSnapshot.query.filter(NetWorthSnapshot.user_id == args.user_id).all()
        }
        dates = [d for d in month_starts(first, date.today()) if d not in existing]
        print(f"Earliest activity {first}; {len(dates)} month(s) without a snapshot.")

        series = reconstruct_series(records, dates, _price_fn, _rate_fn, "USD")
        to_write = [row for row in series if "total" in row]
        for row in series:
            if "total" in row:
                print(f"  {row['date']}  ${row['total']:,.2f}")
            else:
                print(f"  {row['date']}  skipped ({'; '.join(row['skipped'])})")

        if not args.apply:
            print(f"\nDry run: would save {len(to_write)} snapshot(s). Re-run with --apply to write them.")
            return 0

        for row in to_write:
            by_type = row["by_asset_type"]
            db.session.add(
                NetWorthSnapshot(
                    user_id=args.user_id,
                    snapshot_date=row["date"],
                    total_net_worth=row["total"],
                    total_stock_value=round(by_type.get("stock", 0.0) + by_type.get("mutual_fund", 0.0), 2),
                    total_property_value=round(by_type.get("real_estate", 0.0), 2),
                    total_profit_loss=0.0,
                    total_liabilities=0.0,
                    by_asset_type=by_type,
                    currency="USD",
                )
            )
        db.session.commit()
        print(f"\nSaved {len(to_write)} snapshot(s).")
        return 0


if __name__ == "__main__":
    sys.exit(main())
