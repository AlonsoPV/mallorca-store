---
name: Promotion price authority
description: Durable rule for keeping scheduled branch promotions consistent across storefront and commerce flows.
---

The active promotion selected for the requested branch and time is the source of truth for the public price, cart recalculation, and order creation. Product and branch `salePrice` values remain fallback prices when no promotion is active.

**Why:** A promotion can start or finish without a product edit, and checkout must not trust a stale client price or previously stored cart price.

**How to apply:** Resolve the promotion on the server for every catalog/cart/order calculation, using branch specificity before recency, and derive both final price and savings from the same calculation.