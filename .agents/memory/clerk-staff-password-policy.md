---
name: Clerk staff password policy
description: Production Clerk's observed password minimum for administratively created staff accounts.
---

Production Clerk rejected a 12-character password when an administrator created a staff account; the provider reported a minimum of 15 characters.

**Why:** The application generated shorter passwords and accepted manually entered ones that Clerk would reject, while returning a generic error that concealed the cause.

**How to apply:** Keep staff password generation, manual-entry validation, and the API contract aligned with at least this minimum. Preserve a clear provider-validation message instead of weakening Clerk settings; development and production policies may differ.