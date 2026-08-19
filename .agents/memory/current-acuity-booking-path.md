---
name: Current Acuity booking path
description: Current source-of-truth for how Client Dashboard creates appointments.
---

The current web and mobile clients implement location, service, date/time, and confirmation screens that submit to the API's Acuity-backed appointment-creation route. Older architecture/audit documents still describe an external Acuity handoff for the main booking flow; that description is stale relative to the current source.

**Why:** Treating the old handoff documentation as current would cause audits to miss the real native booking validation and live Acuity creation path.

**How to apply:** Inspect the current client booking screens and API route before relying on historical docs. Keep external Acuity links identified separately for free trials or membership purchases.