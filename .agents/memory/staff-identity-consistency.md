---
name: Staff identity consistency
description: Cross-system password changes for staff accounts use PostgreSQL and Clerk, which cannot be committed atomically.
---

Do not report a staff password change as saved when Clerk rejects it. Roll back the local database change on provider failure, and surface an explicit review-required error if the provider succeeds but the database commit fails. Never assume that a PostgreSQL transaction rolls back a remote identity-provider update.

**Why:** Username sign-in first verifies a locally stored password hash and then asks Clerk to authenticate the same password. A successful update on only one side can lock staff out even though the admin UI appeared successful.

**How to apply:** Any future staff creation, promotion, credential edit, or recovery workflow touching both stores must either reconcile failed cross-system updates or visibly flag the account for review. Do not log plaintext credentials or attempt to restore an old password from its hash.