---
name: Workspace dependency hydration
description: Distinguish stale local package installation from source or deployment errors in the pnpm artifact workspace.
---

When an artifact builds but its local runtime cannot resolve a dependency already declared in its manifest and pinned in the lockfile, check for a stale workspace installation before changing code or package declarations.

**Why:** After Git changes advance the manifest and lockfile, the development `node_modules` tree can remain behind. Publishing performs its own install, so a local startup failure may not be a production dependency omission.

**How to apply:** Compare the manifest and lockfile to the installed package link, hydrate from the frozen lockfile if needed, then restart the affected workflow and verify its health endpoint.