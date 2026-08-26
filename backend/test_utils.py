"""
External-API timeout handling. requests.get/post calls already pass an
explicit timeout= everywhere in utils.py/app.py/email_service.py (verified
by reading every call site); this file covers _with_timeout, the wrapper
used for the three NSE/mftool libraries that have no timeout parameter of
their own (nsefetch, nsepy's get_history, mftool's get_scheme_quote).
"""
import concurrent.futures
import time

import pytest

from backend.utils import _with_timeout


def test_with_timeout_returns_the_wrapped_call_result():
    assert _with_timeout(lambda x, y: x + y, 2, 3, y=4) == 7


def test_with_timeout_raises_on_a_call_that_exceeds_the_deadline():
    def _slow():
        time.sleep(2)
        return "too late"

    with pytest.raises(concurrent.futures.TimeoutError):
        _with_timeout(_slow, 0.05)


def test_with_timeout_propagates_the_wrapped_call_s_own_exception():
    def _boom():
        raise ValueError("upstream library failed")

    with pytest.raises(ValueError, match="upstream library failed"):
        _with_timeout(_boom, 2)


def test_with_timeout_does_not_block_past_the_deadline_even_though_the_call_keeps_running():
    # The real point of _with_timeout: a hung third-party call must not
    # hold up the caller for its full duration -- Python can't kill the
    # background thread, but the wrapper must return control immediately.
    def _slow():
        time.sleep(1)
        return "done"

    started = time.monotonic()
    with pytest.raises(concurrent.futures.TimeoutError):
        _with_timeout(_slow, 0.05)
    elapsed = time.monotonic() - started
    assert elapsed < 0.5
