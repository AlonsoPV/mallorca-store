---
name: Payment session locking
description: Tradeoff between checkout concurrency and external-provider transaction duration.
---

Keep external checkout creation inside the existing order lock until retries can claim durable ownership of a single attempt and provider requests are idempotent across lost responses.

**Why:** Shortening the database transaction looks attractive for Autoscale and PostgreSQL usage, but a process can fail after the provider creates a session and before the local order records it. A second caller might then create another usable checkout. An order-row lock currently serializes normal concurrent attempts, while a lost provider response still deserves explicit testing. This is a risk, not evidence of duplicate charges.

**How to apply:** Before altering checkout transaction boundaries, design provider-specific retry keys, a durable in-progress attempt with recovery, and tests for concurrent calls, timeouts, webhook replays, and paid-order state. Do not change providers solely for cost optimization.