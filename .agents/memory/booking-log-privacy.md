---
name: Booking log privacy
description: Privacy standard for server diagnostics around booking and appointment flows.
---

Booking and appointment logs must contain only operational metadata: request or appointment identifiers, safe source labels, location/service identifiers, acknowledgement state, HTTP status, and fixed error codes. Never emit member names, email addresses, phone numbers, Clerk claims, authorization data, tokens, credentials, or raw Acuity request and response payloads.

**Why:** Booking integrations process member identity and third-party responses. Operational diagnostics are useful without exposing personal or credential data in logs.

**How to apply:** When adding or editing booking/appointment diagnostics, replace raw objects and caught errors with an HTTP status or fixed error code. Log identity resolution as a source label (for example, `clerk` or `booking-form`) rather than the value itself.