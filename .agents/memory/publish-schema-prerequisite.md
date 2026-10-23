---
name: Publish schema prerequisite
description: A successful app deployment does not prove the Drizzle schema was applied to development before publishing.
---

When a published feature depends on a new table, confirm that the table exists in the development database, not just in the Drizzle source, before recommending republishing.

**Why:** Payment confirmation failed because its event table was declared in source but absent in both databases. Successful app builds did not catch this. Publish compares the actual development and production schemas; code alone is not the schema migration.

**How to apply:** Inspect both environments read-only, apply the existing development schema through the standard database package command, verify the required constraints, and let the user apply production schema changes through Publish. Never add production startup DDL or claim a Git push applies the database schema.
