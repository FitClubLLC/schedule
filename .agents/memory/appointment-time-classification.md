---
name: Appointment time classification
description: Eastern-time rule for upcoming, past, and summary appointment data.
---

Use the same Eastern Time calendar boundary and actual appointment instant to classify Client Dashboard appointments as upcoming or past. Apply that one partition to individual lists and summary counts.

**Why:** Acuity date queries include the current calendar day. UTC or server-local date calculations misclassify same-day evening appointments, and date-only logic fails across daylight-saving transitions.

**How to apply:** Query Acuity using the Eastern calendar date, then reclassify returned appointments by their offset-aware datetime before presenting upcoming, past, counts, or the next session. Keep fallback parsing in Eastern Time when an Acuity datetime lacks an offset.