"""
Regression tests for finance.xirr — specifically its Newton's-method solver,
which used to be able to diverge to an astronomical or crashing rate on
certain cash flow patterns. See git history for the original bug report:
a holding's XIRR displayed as "+9.589250927988066e+52%" in the UI.
"""
import sys
import os
from datetime import date, timedelta
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.finance import xirr


def test_xirr_never_returns_an_absurd_magnitude():
    # This exact cash flow pattern used to make Newton's method diverge until
    # (1 + rate) ** years overflowed a Python float and raised OverflowError.
    flows = [
        (date(2024, 10, 11), -68904.10003764369),
        (date(2026, 2, 20), -32681.090977474654),
        (date(2024, 4, 4), -24014.53987253252),
        (date(2025, 1, 2), 69498.87326949195),
    ]
    rate = xirr(flows)  # must not raise, and must not be a garbage magnitude
    assert rate is None or abs(rate) <= 50.0


def test_xirr_never_diverges_across_random_cash_flow_patterns():
    random.seed(42)
    base = date(2024, 1, 1)
    checked = 0
    for _ in range(5000):
        n = random.randint(2, 5)
        flows = [
            (base + timedelta(days=random.randint(0, 800)), random.uniform(-100000, 100000))
            for _ in range(n)
        ]
        if not any(a < 0 for _, a in flows) or not any(a > 0 for _, a in flows):
            continue
        checked += 1
        rate = xirr(flows)  # must not raise
        assert rate is None or abs(rate) <= 50.0
    assert checked > 1000  # sanity check the fuzzer actually exercised enough cases
