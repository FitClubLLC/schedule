---
name: Acuity booking eligibility authority
description: Rules for certificate/package validation and location/service eligibility in Client Dashboard booking.
---

Treat Acuity's certificate-check endpoint as the authority for whether a certificate is currently usable for a particular appointment type and member email. Do not infer usability solely from cached certificate metadata or a remaining-value display. Use one server-side location/service validator for availability and final appointment creation.

**Why:** Certificate metadata can be stale, lack expiry semantics, or represent package-level values. Availability that applies different location/service rules than final submission lets members select slots they cannot book.

**How to apply:** Revalidate an entered certificate against Acuity immediately before creation, and compute display eligibility through Acuity validation. Apply the same configured location/service rule before any availability request and before the create request.