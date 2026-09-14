---
name: Product media storage
description: Durable storage and access boundary for catalog images.
---

Catalog image paths belong in PostgreSQL, but image bytes belong in App Storage. The public storefront must be able to read product objects without a session, while only authorized staff may mint presigned upload URLs.

**Why:** Product images are public catalog content, but presigned PUT URLs are write-capable and must not be exposed to anonymous callers. The app uses Clerk-based staff authorization rather than the storage template's Replit Auth session shape.

**How to apply:** Mount object-serving routes where public catalog routes are reachable, protect only upload URL creation with the app's existing staff-role middleware, and resolve `/objects/...` paths through the API storage route in browser code.