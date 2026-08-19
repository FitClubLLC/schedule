---
name: Acuity-Square payment boundary
description: Client Dashboard uses Acuity for scheduling/packages and the existing Acuity-integrated Square flow for payments.
---

Client Dashboard must preserve the existing Acuity → Square payment flow. Acuity remains the scheduling and package/certificate source of truth; Square remains the payment processor through the existing Acuity integration. Do not add, configure, migrate to, or reference Stripe or introduce a second payment system.

**Why:** The product owner explicitly confirmed this architecture after an audit incorrectly treated the payment processor as unknown.

**How to apply:** Any membership/package purchase or “seamless Acuity” work should improve the handoff/presentation and return-to-app refresh behavior without reimplementing checkout, changing payment providers, or bypassing Acuity.