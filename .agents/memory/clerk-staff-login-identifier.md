---
name: Clerk staff login identifier
description: Production Clerk sign-in policy and the distinction between app usernames and authentication identifiers.
---

The production Clerk public authentication configuration reports that usernames are disabled as sign-in identifiers. A staff member's app username is still useful internally, but sending it directly to Clerk sign-in produces `form_param_format_invalid` for `identifier`; the account's email is the supported identifier.

**Why:** The app previously advertised username login and displayed the username with the generated password, leading staff to try an identifier that production Clerk rejects.

**How to apply:** For Clerk-backed staff sign-in and credential handoff, use the account email. Local-development authentication may still accept usernames; do not silently expose a public username-to-email lookup or assume Clerk development and production have identical policies.