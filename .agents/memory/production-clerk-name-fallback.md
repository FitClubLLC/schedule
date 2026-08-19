---
name: Production Clerk name fallback
description: How booking handles the Production Clerk environment where user names are not collected.
---

Production Clerk users may not have first or last names because that environment's name collection is disabled. Booking must not depend on Clerk name fields being present.

**Why:** Acuity requires a non-empty first name, while authenticated Production Clerk users can legitimately have no name in their profile or signed session claims.

**How to apply:** Prefer a non-empty name from the verified Clerk user or signed session claims. If neither provides a first name, collect it in the booking flow, trim it server-side, and reject locally rather than sending an empty value to Acuity. Do not change Clerk secrets or use client identity fields when trusted Clerk data is available.