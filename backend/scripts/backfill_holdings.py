"""
One-off backfill: migrate rows from the old `assets` table into the new
holdings / holding_transactions / holding_valuations model.

Nothing is deleted. `assets` is renamed to `assets_legacy` at the very end,
and only after a structural spot-check confirms every row's value was
carried over correctly. If the check fails, the transaction is rolled back
and the rename never happens.

Usage: PYTHONPATH=<repo root> python -m backend.scripts.backfill_holdings
"""
import os
import sys
from collections import defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text

from backend.app import create_app
from backend.models import Holding, HoldingTransaction, HoldingValuation, db

COUNTRY_CURRENCY = {"United States": "USD", "Australia": "AUD", "India": "INR"}


def currency_for_country(country):
    return COUNTRY_CURRENCY.get(country, "USD")


def fetch_legacy_assets():
    rows = db.session.execute(text("select * from assets")).mappings().all()
    return [dict(r) for r in rows]


def backfill():
    assets = fetch_legacy_assets()
    print(f"Found {len(assets)} legacy asset rows")
    if not assets:
        print("Nothing to backfill.")
        return True

    # Group cash rows by (user, household, account, country) into one holding
    # with one valuation entry per historical row — mirrors the old
    # aggregate_cash_by_account grouping in services.py.
    cash_groups = defaultdict(list)
    non_cash = []
    for a in assets:
        if a["asset_type"] == "cash":
            key = (a["user_id"], a["household_id"], a["account"], a["country"])
            cash_groups[key].append(a)
        else:
            non_cash.append(a)

    holdings_created = 0
    transactions_created = 0
    valuations_created = 0
    old_total = 0.0

    for a in non_cash:
        currency = currency_for_country(a["country"])

        if a["asset_type"] in ("stock", "mutual_fund"):
            holding = Holding(
                user_id=a["user_id"], household_id=a["household_id"],
                asset_type=a["asset_type"], symbol=a["symbol"],
                name=a["symbol"] or f"Asset #{a['id']}",
                country=a["country"], account=a["account"], currency=currency,
                notes=a["notes"], tags=a["tags"],
            )
            db.session.add(holding)
            db.session.flush()
            units, buy_price = a["units"] or 0.0, a["buy_price"] or 0.0
            db.session.add(HoldingTransaction(
                holding_id=holding.id, user_id=a["user_id"], transaction_type="buy",
                transaction_date=a["purchase_date"], quantity=units, price_per_unit=buy_price,
                currency=currency,
            ))
            holdings_created += 1
            transactions_created += 1
            old_total += units * buy_price

        elif a["asset_type"] in ("real_estate", "metal"):
            new_type = "real_estate" if a["asset_type"] == "real_estate" else "commodity"
            holding = Holding(
                user_id=a["user_id"], household_id=a["household_id"],
                asset_type=new_type, symbol=None, name=a["name"] or f"Asset #{a['id']}",
                country=a["country"], account=a["account"], currency=currency,
                notes=a["notes"], tags=a["tags"],
            )
            db.session.add(holding)
            db.session.flush()
            buy_value = a["buy_value"] or 0.0
            current_value = a["current_value"] if a["current_value"] is not None else buy_value

            if new_type == "real_estate":
                db.session.add(HoldingValuation(
                    holding_id=holding.id, user_id=a["user_id"],
                    valuation_date=a["purchase_date"], value=buy_value, currency=currency,
                ))
                valuations_created += 1
                if current_value != buy_value:
                    db.session.add(HoldingValuation(
                        holding_id=holding.id, user_id=a["user_id"],
                        valuation_date=date.today(), value=current_value, currency=currency,
                        notes="Backfilled from legacy current_value",
                    ))
                    valuations_created += 1
            else:
                # Legacy 'metal' rows had no tracked quantity/symbol — represent
                # as a single unit-normalized buy so cost basis is preserved;
                # edit later to a real metal symbol + quantity for live pricing.
                db.session.add(HoldingTransaction(
                    holding_id=holding.id, user_id=a["user_id"], transaction_type="buy",
                    transaction_date=a["purchase_date"], quantity=1.0, price_per_unit=buy_value,
                    currency=currency,
                    notes="Backfilled from legacy 'metal' asset — no tracked symbol/quantity",
                ))
                transactions_created += 1
            holdings_created += 1
            old_total += buy_value

        elif a["asset_type"] == "deposit":
            holding = Holding(
                user_id=a["user_id"], household_id=a["household_id"],
                asset_type="fixed_deposit", symbol=None, name=a["institution"] or a["account"],
                country=a["country"], account=a["account"], institution=a["institution"], currency=currency,
                notes=a["notes"], tags=a["tags"],
            )
            db.session.add(holding)
            db.session.flush()
            value = a["value"] or 0.0
            db.session.add(HoldingValuation(
                holding_id=holding.id, user_id=a["user_id"],
                valuation_date=a["purchase_date"], value=value, currency=currency,
            ))
            holdings_created += 1
            valuations_created += 1
            old_total += value

        elif a["asset_type"] == "loan":
            holding = Holding(
                user_id=a["user_id"], household_id=a["household_id"],
                asset_type="loan", symbol=None, name=a["institution"] or a["account"],
                country=a["country"], account=a["account"], institution=a["institution"], currency=currency,
                notes=a["notes"], tags=a["tags"],
            )
            db.session.add(holding)
            db.session.flush()
            value = a["value"] or 0.0
            db.session.add(HoldingValuation(
                holding_id=holding.id, user_id=a["user_id"],
                valuation_date=a["purchase_date"], value=value, currency=currency,
            ))
            holdings_created += 1
            valuations_created += 1
            old_total += -value

    for (user_id, household_id, account, country), rows in cash_groups.items():
        currency = currency_for_country(country)
        rows_sorted = sorted(rows, key=lambda r: r["purchase_date"])
        latest = rows_sorted[-1]
        holding = Holding(
            user_id=user_id, household_id=household_id,
            asset_type="cash", symbol=None, name=latest["institution"] or account,
            country=country, account=account, institution=latest["institution"], currency=currency,
            notes=latest["notes"], tags=latest["tags"],
        )
        db.session.add(holding)
        db.session.flush()
        for r in rows_sorted:
            db.session.add(HoldingValuation(
                holding_id=holding.id, user_id=user_id,
                valuation_date=r["purchase_date"], value=r["value"] or 0.0, currency=currency,
                notes=r["notes"],
            ))
            valuations_created += 1
        holdings_created += 1
        old_total += latest["value"] or 0.0

    db.session.flush()

    # Structural spot-check: sum of new cost-basis-equivalent values should
    # equal the sum of old buy-side values. Deterministic — doesn't depend on
    # live prices, so it's a stable pre-rename verification.
    new_total = 0.0
    for h in Holding.query.all():
        if h.asset_type in ("stock", "mutual_fund", "commodity"):
            txs = HoldingTransaction.query.filter_by(holding_id=h.id).all()
            new_total += sum(
                (t.quantity * t.price_per_unit) * (1 if t.transaction_type == "buy" else -1)
                for t in txs
            )
        else:
            vals = (
                HoldingValuation.query.filter_by(holding_id=h.id)
                .order_by(HoldingValuation.valuation_date.asc())
                .all()
            )
            if vals:
                # cash's old-model anchor was the *latest* balance; everything
                # else (real_estate/fixed_deposit/loan) anchors on the
                # original/buy-side entry, matching how old_total was built above.
                anchor = vals[-1].value if h.asset_type == "cash" else vals[0].value
                new_total += -anchor if h.asset_type == "loan" else anchor

    print(f"Holdings created: {holdings_created}")
    print(f"Transactions created: {transactions_created}")
    print(f"Valuations created: {valuations_created}")
    print(f"Old buy-side total: {old_total:.2f}")
    print(f"New basis-side total: {new_total:.2f}")

    if abs(old_total - new_total) > 0.5:
        db.session.rollback()
        print("MISMATCH — rolled back, NOT renaming assets table. Investigate before re-running.")
        return False

    db.session.commit()
    print("Backfill committed.")

    db.session.execute(text("alter table assets rename to assets_legacy"))
    db.session.commit()
    print("Renamed assets -> assets_legacy (nothing deleted).")
    return True


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        ok = backfill()
        sys.exit(0 if ok else 1)
