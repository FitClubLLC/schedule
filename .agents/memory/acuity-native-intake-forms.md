---
name: Acuity native intake forms
description: How the native booking flow must discover and submit required Acuity intake-form answers.
---

When using the native appointment-creation API, Acuity validates every required intake field assigned to the appointment type. Required form fields must be discovered from Acuity's `GET /forms` response and submitted using the appointment `fields` array of `{ id, value }` objects.

**Why:** Appointment identity fields can be valid while Acuity still rejects the booking because a required assigned intake field was omitted. Human-facing form labels are not stable request identifiers.

**How to apply:** Before adding or changing native booking UI, inspect the live assigned forms and their fields, keep verified IDs configurable, collect required responses in each booking client, and locally reject missing responses before the Acuity appointment request.