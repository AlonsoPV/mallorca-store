---
name: Managed database choice
description: Why Mallorca Ecommerce uses Replit PostgreSQL instead of the initially suggested Supabase stack.
---

Use Replit's managed PostgreSQL database for Mallorca Ecommerce unless a future requirement specifically depends on a Supabase-only capability.

**Why:** The original brief allowed adapting to Replit's recommended architecture. The managed database is already provisioned, integrates with Publish and checkpoints, and avoids adding an external dependency while preserving the requested relational model.

**How to apply:** Extend the existing Drizzle schema and OpenAPI-backed API. Do not introduce a second database or Supabase Auth/Storage implicitly; reassess only when a concrete later-phase requirement justifies it.