# Security policy

## Reporting a problem

Please report security problems privately, not in a public issue. Use GitHub's private reporting form:
https://github.com/nishmethuku/networth-tracker/security/advisories/new

Include what you found, the steps to reproduce it, and what you think the impact is. A short description is fine.

## What to expect

- A first reply within 3 working days.
- A fix or a clear plan within 30 days for confirmed problems, sooner for anything that exposes another person's data.
- Credit in the changelog if you want it.

## In scope

The website at https://networth-tracker-tau.vercel.app and its API. The most useful reports are ones where a signed-in person can reach another person's data, skip the sign-in checks, or get around the two-step sign-in.

## Out of scope

Denial of service by sheer volume, spam, social engineering, and problems that need a stolen or already compromised device.

## Good faith

Testing against your own account is welcome. Please do not access, change or delete other people's data, and stop as soon as you have shown the problem.

More detail on how the app is protected, and what is not covered yet, is in `docs/security.md` and `docs/threat-model.md`.
