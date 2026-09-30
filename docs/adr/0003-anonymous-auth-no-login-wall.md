# Anonymous sign-in, no login wall

Every device signs in anonymously on first open and gets a stable user id; there are no accounts, emails or passwords, and a household is joined with an invite code instead. This keeps first use to zero friction for a shared family list.

The identity lives in browser storage, which is per origin, so a stable origin is essential: a URL that changes per deploy silently creates a new user and a new household each time (see ADR 0004). The trade-off is that clearing site data or switching browser profile loses the identity.
