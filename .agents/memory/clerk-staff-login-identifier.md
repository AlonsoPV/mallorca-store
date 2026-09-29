---
name: Clerk staff username bridge
description: Production Clerk sign-in policy and the security boundary for app-username access.
---

Production Clerk has usernames disabled as sign-in identifiers. Sending an app username directly to Clerk produces `form_param_format_invalid`; Clerk accepts the account email. The app can offer staff username access by verifying its own password hash on the server first, returning the associated email only upon a match, and then letting Clerk independently authenticate that email and password to establish the session.

**Why:** Staff were issued usernames they could not use in production, but a public username-to-email lookup would disclose account addresses. The app's local hash and Clerk password can diverge after a direct change in Clerk or a failed credential sync.

**How to apply:** Preserve direct email login as a fallback. Never resolve a username without password verification and durable throttling, or treat local verification as a Clerk session. Keep local-development tokens disabled outside an explicit development runtime. If a password changed directly in Clerk, the staff member may need to sign in by email until the app-managed password is synchronized.