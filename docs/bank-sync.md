# Automatic bank syncing

The groundwork is built and switched off. Nothing changes for anyone until a provider is configured.

## How it works

- `backend/sync_service.py` holds a small provider interface, an encrypted token vault, and the code that turns bank transactions into budget entries.
- Transactions are matched by the provider's own id, so syncing twice never duplicates a purchase. Pending charges wait until they settle.
- Categories are guessed from the merchant name (Starbucks becomes food, Uber becomes transport, payroll becomes paycheck). Anything unknown lands in "other" and can be changed by hand.
- Provider tokens are encrypted with `SYNC_ENCRYPTION_KEY` before they reach the database. "Delete all my data" also removes linked banks.
- Routes (all need a login): `GET /sync/status`, `POST /sync/link-token`, `POST /sync/exchange`, `POST /sync/connections/<id>/pull`, `DELETE /sync/connections/<id>`.
- Providers: `fake` (tests and demos, no keys) and `plaid` (banks and cards in the US). Brokers (SnapTrade) would be one more class.

## What only you can do

1. Create a Plaid account at https://dashboard.plaid.com/signup and copy the Client ID and the Sandbox secret. Production access needs Plaid's approval and a review of your use.
2. Make an encryption key by running `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Keep a copy somewhere safe: without it, stored bank tokens cannot be read.
3. In Render, add these environment variables to the backend: `SYNC_PROVIDER=plaid`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`, `SYNC_ENCRYPTION_KEY`.

## Still to build once the keys exist

- The "Connect a bank" button in Settings (it uses Plaid's Link window, which needs your keys to test).
- A nightly job that pulls new transactions for everyone.
- Trying the Plaid code against Plaid's sandbox. It is tested with a faked network but has not talked to the real service yet.
- Brokers (balances and holdings) through a second provider.

## Privacy note

Linking a bank sends the user to the provider's own sign-in window. The app never sees bank passwords, only a token. Say this in the privacy policy before turning it on.
