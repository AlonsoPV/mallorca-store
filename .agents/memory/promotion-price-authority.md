---
name: Promotion price authority
description: Durable rule for keeping scheduled branch promotions consistent across storefront and commerce flows.
---

The active promotion selected for the requested branch and time is the source of truth for the public price, cart recalculation, and order creation. Product and branch `salePrice` values remain fallback prices when no promotion is active.

**Why:** A promotion can start or finish without a product edit, and checkout must not trust a stale client price or previously stored cart price.

**How to apply:** Resolve the promotion on the server for every catalog/cart/order calculation, using branch specificity before recency, and derive both final price and savings from the same calculation.

Scheduled promotions are edited in place and cancelled with persistent metadata instead of deleting their rows; only scheduled records are mutable, while active and finished records remain immutable.

**Why:** Administration needs to correct or stop future promotions without losing the historical entry, and a cancelled record must never be selected as an active price source.

**How to apply:** Keep cancellation distinct from the time-derived finished state, reject edits/cancellation once a promotion has started, and exclude cancelled records from active promotion queries.