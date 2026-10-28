# Threat model

A short, honest map of who might attack this app, what they would go after, and which check stops them. Each defence names the test or file that proves it.

## What is worth protecting

- Financial data: holdings, balances, liabilities, spending, goals.
- Bank access tokens (when syncing is on) and the account itself.
- Availability: the app should keep working for everyone when one person misbehaves.

## Trust boundaries

1. **Browser to API.** Anything in a request can be forged. Only the verified sign-in token is trusted.
2. **API to database.** The API connects directly, so database row rules do not protect it. The API must filter every query itself.
3. **API to outside services** (Supabase, Plaid, the AI provider, price sources). Their addresses come from server settings, never from a request.
4. **Scheduled jobs to API.** Protected by shared secrets, compared in constant time.

## Attacks considered

| Attack                                                                                             | Defence                                                                                                                     | Proof                                                  |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Forged, expired or replayed sign-in token                                                          | Signature checked against Supabase's public keys; asymmetric algorithms only; expiry, subject, audience and issuer required | `backend/test_auth_tokens.py`                          |
| `alg: none` and key-confusion tokens                                                               | Algorithm allow-list of ES256 and RS256                                                                                     | `backend/test_auth_tokens.py`                          |
| Stolen password-only token after two-step sign-in is on                                            | Token must be aal2 once a factor is enrolled                                                                                | `backend/test_auth.py`                                 |
| Reading or changing another user's record by guessing an id                                        | Every query filters by user or household                                                                                    | `backend/test_tenant_isolation.py`                     |
| Linking your record to someone else's (an expense on their loan, funding a buy from their holding) | The linked record's owner is checked before saving                                                                          | `backend/test_tenant_isolation.py`                     |
| Writing into a household you do not belong to                                                      | Editor role checked on every write                                                                                          | `backend/test_tenant_isolation.py`                     |
| Leaking one user's data through a list or export                                                   | Lists and exports are scoped; markers never appear in another user's responses                                              | `backend/test_tenant_isolation.py`                     |
| Script injection in the website                                                                    | Content-Security-Policy with no inline-script or eval allowance                                                             | `frontend/e2e/csp.spec.ts`                             |
| Clickjacking                                                                                       | `frame-ancestors 'none'` and `X-Frame-Options: DENY`                                                                        | `frontend/e2e/csp.spec.ts`, `backend/test_security.py` |
| Calling the API from a hostile website                                                             | CORS allow-list of the site and the mobile apps                                                                             | `backend/test_health_and_cors.py`                      |
| Choosing your own address to dodge rate limits                                                     | Only the trusted end of `X-Forwarded-For` is read                                                                           | `backend/test_proxy_fix.py`                            |
| Known-vulnerable libraries                                                                         | `pip-audit` and `npm audit` reviewed; auth library kept current                                                             | `backend/requirements.txt`                             |
| Bank token theft from a database leak                                                              | Tokens encrypted with a key held only by the server                                                                         | `backend/test_sync_service.py`                         |
| Error messages revealing internals                                                                 | Generic 500 responses with a request id                                                                                     | `backend/app.py`                                       |

## Not covered yet

- No independent penetration test.
- Rate limits are per process unless `REDIS_URL` is set.
- The privacy policy and terms need a lawyer's review.
- See "Honest gaps" in `docs/security.md` for the rest.
