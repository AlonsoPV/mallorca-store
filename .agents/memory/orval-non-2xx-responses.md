---
name: Orval non-2xx responses
description: How to keep generated clients and Zod response schemas typed for intentionally unavailable endpoints.
---

Every OpenAPI operation must include a typed 2xx response, even when the current implementation intentionally returns only an error such as 503.

**Why:** With the workspace's Orval configuration, an operation that declared only a typed 503 generated a `void` success response parser. The API then threw a Zod error while trying to return the correctly shaped 503 JSON.

**How to apply:** Define the eventual success response schema under a 2xx status and reuse the appropriate schema for current non-2xx responses. Regenerate both the React client and Zod schemas before editing handlers against the generated types.

Query parameters with OpenAPI `format: date-time` may generate a Zod `Date` parser while Express supplies strings. Normalize those query values to `Date` before parsing on the server.

**Why:** The generated React client correctly sends ISO strings, but the generated server-side Zod parser rejected the same strings without an explicit normalization step.

**How to apply:** For date-time query parameters, copy `req.query`, convert the known string fields with `new Date(...)`, then pass the normalized object to the generated query schema.