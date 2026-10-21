"""
Production guard for admin/one-off scripts.

Any script that talks to the database directly (bypassing the Flask API) must
call assert_not_production() at the very top. This raises immediately if the
DATABASE_URL points at the production Supabase project, unless the caller has
set ALLOW_DIRECT_PROD_WRITES=I_KNOW_WHAT_I_AM_DOING.

Usage:
    from backend.admin_guard import assert_not_production
    assert_not_production()

To run against production (only with explicit confirmation):
    ALLOW_DIRECT_PROD_WRITES=I_KNOW_WHAT_I_AM_DOING python my_script.py
"""
import os

# Unique substring of the production Supabase project URL.
_PROD_PROJECT_REF = "yoykhatwyrxuzcesbhhf"
_OVERRIDE_ENV = "ALLOW_DIRECT_PROD_WRITES"
_OVERRIDE_VALUE = "I_KNOW_WHAT_I_AM_DOING"


def assert_not_production():
    db_url = os.environ.get("DATABASE_URL", "")
    if _PROD_PROJECT_REF not in db_url:
        return  # not pointing at production, safe to proceed
    override = os.environ.get(_OVERRIDE_ENV, "")
    if override == _OVERRIDE_VALUE:
        print(
            f"WARNING: running against PRODUCTION database. "
            f"Override active ({_OVERRIDE_ENV}={_OVERRIDE_VALUE})."
        )
        return
    raise RuntimeError(
        f"\n\n"
        f"  BLOCKED: DATABASE_URL points at the production Supabase project.\n"
        f"  Direct writes to production from scripts are not allowed.\n\n"
        f"  If you are absolutely sure and have the owner's explicit approval:\n"
        f"    export {_OVERRIDE_ENV}={_OVERRIDE_VALUE}\n"
        f"    python your_script.py\n"
    )
