---
name: Acuity live membership verification
description: Live Acuity products expose subscription kind and redeemable counts, but not billing interval, rollover mode, or connected processor.
---

The Acuity `GET /products` response identifies Fit Club membership products as subscriptions and exposes price, appointment type IDs, appointment counts, hidden/unavailable access flags, and package expiration. It does not expose the configured billing interval, number of billing cycles, renewal state, or whether unused credits reset, roll over, or remain as-is. Acuity admin settings are required for those facts. Product visibility (`hidden`) is separate from whether an assigned member certificate is returned by an email lookup.

**Why:** A read-only live catalog audit confirmed product pricing and 4/8 Workout for 1 counts but could not safely or accurately infer subscription lifecycle settings or the active payment processor from product data.

**How to apply:** Treat product counts as the configured redeemable amount, not proof of renewal behavior. Keep the Client Dashboard dynamic and certificate-based; verify recurrence, rollover, Square, and member assignment through Acuity admin configuration before implementing payment or subscription UI.