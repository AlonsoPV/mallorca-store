---
name: Branch switching safety
description: Business invariants for changing the active storefront branch without losing valid cart products.
---

Changing branches must revalidate every cart line against the target branch and carry forward only lines explicitly reported as available. If the current cart session is empty, it must not remain associated with the previous branch after the selection changes.

**Why:** Branch inventory, availability, product status, and prices are branch-specific. Keeping an old empty session can route the next add-to-cart request to the wrong branch, while keeping unconfirmed lines can create an invalid cart.

**How to apply:** Treat the target branch preview as authoritative for cart lines. Require preview confirmation for non-empty carts, and replace or clear an empty cart session when the branch changes.