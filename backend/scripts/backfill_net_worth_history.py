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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.app import create_app
from backend.history_rebuild_service import rebuild_history


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--apply", action="store_true", help="actually write snapshots (default: dry run)")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        result = rebuild_history(args.user_id, apply=args.apply)

    status = result["status"]
    if status == "has_liabilities":
        print("This user has liabilities, and past debt balances are not reconstructed, so the rebuilt numbers")
        print("would be overstated. Not running.")
        return 1
    if status == "nothing_recorded":
        print("Nothing recorded for this user, nothing to rebuild.")
        return 0
    if status == "up_to_date":
        print("Every month since the first activity already has a snapshot.")
        return 0

    print(f"Earliest activity {result['first_activity']}.")
    for row in result["months"]:
        print(f"  {row['date']}  ${row['total']:,.2f}")
    for row in result["skipped"]:
        print(f"  {row['date']}  skipped ({'; '.join(row['reasons'])})")
    if result["more_to_do"]:
        print("More months remain; run it again to continue.")
    if status == "preview":
        print(f"\nDry run: would save {len(result['months'])} snapshot(s). Re-run with --apply to write them.")
    else:
        print(f"\nSaved {len(result['months'])} snapshot(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
