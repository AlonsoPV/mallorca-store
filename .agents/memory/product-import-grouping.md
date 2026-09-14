---
name: Product import grouping
description: Business rule for importing catalog products with branch-specific rows.
---

Product imports must treat SKU as the product identity and branch code as configuration on that product. Multiple rows for one SKU are valid when they target different branches; the same SKU and branch pair is a row error.

**Why:** The catalog has one product record shared across branches, while availability, inventory, and branch pricing are branch-specific. Creating once per row would duplicate SKUs and make catalog updates ambiguous.

**How to apply:** Validate rows independently, group valid rows by SKU, upsert the product once, and apply each branch configuration in the same per-SKU transaction. Keep invalid rows from rolling back unrelated SKUs.