"""
Keeps stock and fund prices fresh in the background, so opening a page never waits on Yahoo.

Before this, the first page load after a restart (or after midnight) looked up every stock on the
web while the person waited, on a server with a tenth of a CPU. Now one quiet background thread
does that work on a timer and saves the prices; page loads just read what is saved.

It runs only under gunicorn (or when PRICE_REFRESHER=1), never in tests or in `flask db upgrade`.
"""
import logging
import os
import sys
import threading
import time
from datetime import date

from . import price_service
from .models import Holding, db

logger = logging.getLogger("networth_tracker")

REFRESH_INTERVAL_SECONDS = 30 * 60
FIRST_RUN_DELAY_SECONDS = 20
PAUSE_BETWEEN_LOOKUPS_SECONDS = 0.15
# A symbol the refresher has already tried this recently is not looked up again by a page load.
ATTEMPT_FRESH_SECONDS = 2 * 60 * 60

_attempted: dict = {}
_lock = threading.Lock()
_started = False


def recently_attempted(key) -> bool:
    """True if the background job already tried this (asset_type, symbol, currency) lately."""
    with _lock:
        at = _attempted.get(key)
    return at is not None and time.time() - at < ATTEMPT_FRESH_SECONDS


def _mark_attempted(key) -> None:
    with _lock:
        _attempted[key] = time.time()


def refresh_all_prices(app) -> dict:
    """One pass: look up every held stock, fund and crypto price once and save the results."""
    with app.app_context():
        rows = (
            db.session.query(Holding.asset_type, Holding.symbol, Holding.currency)
            .filter(Holding.deleted_at.is_(None), Holding.asset_type.in_(("stock", "mutual_fund", "crypto")))
            .distinct()
            .all()
        )
        keys = [(a, s, c) for a, s, c in rows if s]
        db.session.remove()  # no open transaction while the slow lookups run
        saved, missed = [], 0
        today = date.today()
        for key in keys:
            try:
                price = price_service.get_current_price(*key)
            except Exception as e:  # one bad symbol must not stop the pass
                logger.warning("price refresh failed for %s: %s", key[1], e)
                price = None
            _mark_attempted(key)
            if price and price > 0:
                saved.append((key[0], key[1], today, price, key[2], "live"))
            else:
                missed += 1
            time.sleep(PAUSE_BETWEEN_LOOKUPS_SECONDS)
        if saved:
            price_service.cache_prices_bulk(saved)
        logger.info("price refresh done: %d priced, %d without a price", len(saved), missed)
        return {"priced": len(saved), "missed": missed}


def _loop(app):
    time.sleep(FIRST_RUN_DELAY_SECONDS)
    while True:
        try:
            refresh_all_prices(app)
        except Exception as e:
            logger.warning("price refresh pass failed: %s", e)
        time.sleep(REFRESH_INTERVAL_SECONDS)


def start_if_enabled(app) -> bool:
    """Start the background thread once, only where it belongs. Returns True if it started."""
    global _started
    if _started or app.config.get("TESTING"):
        return False
    flag = os.getenv("PRICE_REFRESHER", "").strip()
    if flag == "0":
        return False
    if flag != "1" and "gunicorn" not in (sys.argv[0] if sys.argv else ""):
        return False
    _started = True
    threading.Thread(target=_loop, args=(app,), name="price-refresher", daemon=True).start()
    return True
