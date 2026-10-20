"""
Recovery tool for when someone loses their authenticator device and can't
complete a two-factor sign-in. Not a web endpoint on purpose -- exposing
"disable someone's 2FA" over HTTP, even behind auth, is exactly the kind
of thing that turns into an account-takeover path if the access control
on it is ever wrong. This only runs locally by someone who already holds
SUPABASE_SERVICE_ROLE_KEY (the same bar as every other admin-ish script
in this repo, e.g. the throwaway-test-user scripts used during
development), via the Supabase Admin API.

Usage: python -m backend.scripts.disable_mfa someone@example.com
"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}


def main():
    if len(sys.argv) != 2:
        print("Usage: python -m backend.scripts.disable_mfa someone@example.com")
        sys.exit(1)
    email = sys.argv[1]

    # The Admin API has no "get user by email" lookup -- page through users
    # and match. Fine for a personal app's user count; would need a real
    # search if this ever served more than a handful of accounts.
    page = 1
    user = None
    while user is None:
        resp = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=HEADERS, params={"page": page, "per_page": 200})
        resp.raise_for_status()
        users = resp.json().get("users", [])
        if not users:
            break
        user = next((u for u in users if u.get("email", "").lower() == email.lower()), None)
        page += 1

    if not user:
        print(f"No user found with email {email}")
        sys.exit(1)

    factors_resp = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users/{user['id']}/factors", headers=HEADERS)
    factors_resp.raise_for_status()
    factors = factors_resp.json()

    if not factors:
        print(f"{email} has no enrolled MFA factors -- nothing to do.")
        return

    for factor in factors:
        print(f"Deleting factor {factor['id']} ({factor.get('factor_type')}, status={factor.get('status')})...")
        delete_resp = requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user['id']}/factors/{factor['id']}", headers=HEADERS)
        delete_resp.raise_for_status()

    print(f"Done -- {email} can now sign in with just their password, and can re-enroll 2FA from Settings afterward.")


if __name__ == "__main__":
    main()
