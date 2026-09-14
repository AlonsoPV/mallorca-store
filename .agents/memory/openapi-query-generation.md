---
name: OpenAPI query generation
description: Orval behavior when an operation has both path and query parameters in the Zod output.
---

When adding query parameters to an operation that already has path parameters, verify the generated Zod barrel for duplicate `*Params` exports and keep the generated output configuration consistent with the public package entrypoint.

**Why:** Orval can generate a combined TypeScript params type with the same name as the operation's runtime path-params schema, causing the workspace typecheck to fail even though each generated file is individually valid.

**How to apply:** After changing OpenAPI parameters, run the API codegen and library typecheck together. If the collision appears, preserve the runtime schemas and expose the generated TypeScript query type under a non-conflicting name through the package barrel.