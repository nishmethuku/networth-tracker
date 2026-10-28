# Security and privacy overview

Written from the code as it stands. Each line below can be checked in the file named next to it.

## Sign-in and access

- Sign-in is handled by Supabase (email and password, Google, and optional two-step sign-in). The API verifies every request's token against Supabase's public keys (`backend/auth.py`).
- Postgres row rules are not the safety boundary, because the API connects directly. The boundary is `require_auth` plus a user or household filter on every query, and each household member has an owner, editor or viewer role (`backend/household_service.py`).
- Private holdings are hidden from a shared household view at the query layer, not only in the screen.

## Data protection

- Bank access tokens (when syncing is on) are encrypted with a key held only in the server settings before they reach the database (`backend/sync_service.py`).
- Scheduled-job endpoints compare their shared secret with a constant-time check.
- Money is stored as exact decimals, so totals do not drift (`migrations/versions/e7b1c4a98d32_*`).
- Daily database backups are encrypted with GPG before they are stored, and kept for 14 days (`.github/workflows/backup.yml`).

## Abuse limits and headers

- Default limit of 60 requests a minute per client, with tighter limits on AI, bank sync, data deletion and account deletion routes. Shared across workers when Redis is set.
- Upload size capped at 8 MB.
- The API sends `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and `Content-Security-Policy: default-src 'none'`. The website sends the same family of headers plus HSTS (`frontend/vercel.json`).
- Cross-site access is limited to the configured website address and the mobile apps' built-in addresses.
- Errors sent to the browser are cleaned so internal details do not leak, and each carries a request id for support.

## Your data, your control

- Export everything as JSON or CSV, delete all data, or delete the account and login from Settings.
- Account deletion needs `SUPABASE_SERVICE_ROLE_KEY` on the backend. Without it the button reports that it is not set up and deletes nothing.

## AI and third parties

- AI features are optional. Provider is chosen with `AI_PROVIDER` (`gemini` by default, or `openai`). With no key the app works without AI.
- The copilot receives a summary (totals and per-holding key figures), never the full transaction list. Imports you start with AI send the file you chose.
- Price providers receive symbols and currencies only.

## Honest gaps

- No independent security audit or penetration test has been done.
- The Plaid and OpenAI integrations are tested with faked networks and need a run against their sandboxes.
- The privacy policy and terms are plain-language drafts. Have a lawyer review them before any paid or commercial launch.
- Free hosting tiers have no uptime guarantee (the backend sleeps when idle).
