# Security and privacy overview

Written from the code as it stands. Each line below can be checked in the file named next to it.

## Sign-in and access

- Sign-in is handled by Supabase (email and password, Google, and optional two-step sign-in). The API verifies every request's token against Supabase's public keys (`backend/auth.py`). Only asymmetric algorithms are accepted (never `none` or a shared-secret algorithm), and the token must carry an expiry, subject, audience and issuer, with the issuer pinned to this project. Real signed tokens are used to try the classic forgery attacks in `backend/test_auth_tokens.py`.
- Once someone turns on two-step sign-in, a password-only token no longer works for the API, not just for the login screen.
- Postgres row rules are not the safety boundary, because the API connects directly. The boundary is `require_auth` plus a user or household filter on every query, and each household member has an owner, editor or viewer role (`backend/household_service.py`).
- Private holdings are hidden from a shared household view at the query layer, not only in the screen.
- Destructive actions (delete all data, delete the account) need a recent sign-in. The check reads the sign-in time that Supabase puts in the token's `amr` claim, so refreshing a token does not count as signing in again. If the sign-in is older than 15 minutes the API answers 403 with `recent_login_required` and the website asks the person to sign in again (`require_recent_auth` in `backend/auth.py`).
- Sensitive actions (data export, restore and wipe, bank connect and disconnect, household invites, joins, leaves, removals and deletion) are written to a per-user security log. People read their own log in Settings, under Security activity. There is no route to edit or delete a log entry. Rows keep only a coarse IP (the last part removed), a short browser string and the request id, and the newest 500 per user are kept (`backend/audit_service.py`).
- "Sign out of all devices" in Settings ends every session for the account, not just the current one.
- `backend/test_tenant_isolation.py` runs against a real Postgres. One user creates data, then a second signed-in user tries every route that takes an id (read, change, delete, link) and every list and export. All of it must be refused and the first user's data must be unchanged. It runs in CI.

## Data protection

- Bank access tokens (when syncing is on) are encrypted with a key held only in the server settings before they reach the database (`backend/sync_service.py`).
- Scheduled-job endpoints compare their shared secret with a constant-time check.
- Money is stored as exact decimals, so totals do not drift (`migrations/versions/e7b1c4a98d32_*`).
- Daily database backups are encrypted with GPG before they are stored, and kept for 14 days (`.github/workflows/backup.yml`).

## Abuse limits and headers

- Behind Render's proxy the app reads the visitor's real address from the trusted end of `X-Forwarded-For` (`TRUSTED_PROXY_COUNT`, default 2 in production), so a caller cannot pick their own address and users do not share one limit.
- Default limit of 60 requests a minute per client, with tighter limits on AI, bank sync, data deletion and account deletion routes. Shared across workers when Redis is set.
- Upload size capped at 8 MB.
- The API sends `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and `Content-Security-Policy: default-src 'none'`. The website sends the same family of headers plus HSTS and a Content-Security-Policy that allows scripts only from the site itself, one fingerprinted inline script and Plaid, and forbids framing, plugins and outside form targets (`frontend/vercel.json`). A browser test loads the real pages under that exact policy and fails on any violation.
- Cross-site access is limited to the configured website address and the mobile apps' built-in addresses (`capacitor://localhost` and `https://localhost`).
- Known-vulnerability scans (`pip-audit`, `npm audit`) are clean for the backend and have no high or critical findings for the website's shipped code.
- Errors sent to the browser are cleaned so internal details do not leak, and each carries a request id for support.

## Your data, your control

- Export everything as JSON or CSV (the export includes your security log), delete all data, or delete the account and login from Settings.
- Account deletion needs `SUPABASE_SERVICE_ROLE_KEY` on the backend. Without it the button reports that it is not set up and deletes nothing.

## AI and third parties

- AI features are optional. Provider is chosen with `AI_PROVIDER` (`gemini` by default, or `openai`). With no key the app works without AI.
- The copilot receives a summary (totals and per-holding key figures), never the full transaction list. Imports you start with AI send the file you chose.
- Price providers receive symbols and currencies only.

## Honest gaps

- Style rules still allow inline styles, because the interface sets many styles in code. Scripts are locked down; styles are not.
- Joining a household from an invite trusts the email address in the sign-in token. That is only safe because Supabase requires email confirmation (checked in Authentication, Sign In / Providers). If that setting is ever turned off, this becomes an account-takeover path.
- The security log is written by the application itself, so someone who gained database access could alter it. It is a tool for the account owner to spot surprises, not tamper-proof evidence.
- A sign-in that is fresh enough for the 15 minute rule still counts if the session was stolen within that window.
- Without `REDIS_URL`, rate limits are counted per server process, so the real limit is looser than it reads.
- Two-step status is cached for up to five minutes, so a brand-new enrolment can take that long to apply to a token that is already open.
- No independent security audit or penetration test has been done.
- The Plaid and OpenAI integrations are tested with faked networks and need a run against their sandboxes.
- The privacy policy and terms are plain-language drafts. Have a lawyer review them before any paid or commercial launch.
- Free hosting tiers have no uptime guarantee (the backend sleeps when idle).
