---
name: Production Clerk booking identity fallback
description: How booking handles Production Clerk profiles that lack Acuity-required identity fields.
---

Production Clerk users may not have first or last names because that environment's name collection is disabled, and they may not have a phone number in their profile or signed session claims. Booking must not depend on these Clerk identity fields being present.

**Why:** Acuity requires a non-empty first name and phone number, while authenticated Production Clerk users can legitimately have neither in their profile or signed session claims.

**How to apply:** Prefer a valid identity field from the verified Clerk user or signed session claims. If neither provides a required name or phone, collect it in the booking flow, trim and validate it server-side, and reject locally rather than sending an empty value to Acuity. Do not change Clerk secrets or use client identity fields when trusted Clerk data is available.