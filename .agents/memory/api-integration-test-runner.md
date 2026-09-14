---
name: API integration test runner
description: Environment-specific rule for running API route integration tests in this pnpm TypeScript monorepo.
---

Route integration tests that import the Express app and workspace database package cannot run directly with Node's strip-types test runner because the monorepo contains extensionless TypeScript workspace imports. Bundle those tests with esbuild as CommonJS first, then run the generated file with Node.

**Why:** Direct execution fails before the tests start on directory and extensionless imports; the existing server build already handles these imports through esbuild.

**How to apply:** Keep pure library tests on the native Node test runner, and give database-backed route tests a separate bundled test script. Use production logger mode for the bundle so pino does not resolve the development transport in the temporary file.