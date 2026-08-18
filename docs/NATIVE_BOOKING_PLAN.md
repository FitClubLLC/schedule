# FitClub Native Booking Flow — Architecture

This document describes the appointment-type selection model for the native
booking flows on web (React/Vite) and mobile (Expo/React Native).

---

## Overview

Both the web portal and mobile app now use a fully native booking flow.
Members never leave the FitClub app to complete a booking — all Acuity
communication happens server-side via HTTP Basic auth.

The **Free Trial** flow is intentionally excluded. It opens the external
Acuity hosted UI via `WebBrowser.openBrowserAsync` (mobile) or
`<a target="_blank">` (web) and is out of scope for this architecture.

---

## Appointment Types

All appointment type IDs are stored as **backend environment variables** and
returned to clients at runtime via `GET /api/booking/config`. Clients must
never hardcode appointment type IDs.

| Key              | Default ID  | Description                                 |
|------------------|-------------|---------------------------------------------|
| `workoutFor1`    | `83398355`  | Workout for 1 — base member session         |
| `redLightTherapy`| `96690076`  | Red Light Therapy — Kentlands only          |
| `freeTrial`      | `83397899`  | Free Trial — external Acuity UI, out of scope|

---

## Location Configuration

Each location declares which appointment types are available through the
native flow via the `appointmentTypeIDs` field returned in `/api/booking/config`.

| Location   | Default `appointmentTypeIDs`         | Env var                          |
|------------|--------------------------------------|----------------------------------|
| POTOMAC    | `["83398355"]` (workoutFor1 only)    | `LOCATION_1_APPOINTMENT_TYPE_IDS`|
| KENTLANDS  | `["83398355","96690076"]` (both)     | `LOCATION_2_APPOINTMENT_TYPE_IDS`|

The env var accepts a comma-separated string. Whitespace is trimmed and empty
segments are ignored. IDs are preserved as strings (no numeric coercion).

To update: set `LOCATION_1_APPOINTMENT_TYPE_IDS` or
`LOCATION_2_APPOINTMENT_TYPE_IDS` in the Replit Secrets panel. No code
deploy is required — both clients reload config on the next page visit.

---

## Booking Flow

```
Book (location cards)
  └─ Location selected
       ├─ 1 eligible service  ──────────────────────► Select Date
       └─ 2+ eligible services ──► Select Service ──► Select Date
                                                           │
                                                      Select Time
                                                           │
                                                        Confirm
                                                           │
                                                       Confirmed
```

### Service Eligibility Rules

Eligibility is computed client-side for display only. The backend/Acuity
enforces the final authority at booking time — client-side filtering cannot
be used to bypass server validation.

For each type ID in `location.appointmentTypeIDs`:

1. **Workout for 1** — always shown, no certificate required.
2. **All other types (e.g. Red Light Therapy)** — shown only if the member
   has an active certificate that covers the type:
   - `cert.appliesToAllProducts === true` (general membership), **or**
   - the type ID appears in `cert.appointmentTypeIDs` (account certs) /
     `certCheck.productIDs` (manually-entered code check result).

### Skipping the Service Selector

When exactly one type passes the eligibility filter, the service selector
screen is bypassed entirely. The member proceeds directly from the location
card to date selection. This is the common path for Potomac (always one type)
and for Kentlands members whose certificate only covers Workout for 1.

---

## Source Files

### Backend

| File | Role |
|---|---|
| `artifacts/api-server/src/config/acuity.ts` | Defines `AcuityLocation.appointmentTypeIDs`, `parseTypeIds()` safe parser, default mappings |
| `artifacts/api-server/src/routes/booking.ts` | `/api/booking/config`, `/api/booking/appointment-types`, availability, create endpoints |

### Web Portal

| File | Role |
|---|---|
| `src/hooks/useBookingApi.ts` | All booking hooks + TypeScript interfaces including `AcuityConfig`, `MemberCertificate`, `CertificateCheckResult` |
| `src/lib/bookingEligibility.ts` | `getEligibleTypeIds()` — shared eligibility utility |
| `src/pages/Book.tsx` | Location cards; routes to SelectService or SelectDate based on eligibility |
| `src/pages/book/SelectService.tsx` | Service selection page (Kentlands eligible-multi case) |
| `src/pages/book/SelectDate.tsx` | Calendar — `useAvailableDates` |
| `src/pages/book/SelectTime.tsx` | Time slots — `useAvailableTimes` |
| `src/pages/book/Confirm.tsx` | Review + submit — `useCreateBooking` |
| `src/pages/book/Confirmed.tsx` | Success + cache invalidation |

### Mobile (Expo)

| File | Role |
|---|---|
| `app/(tabs)/book/index.tsx` | Location cards; eligibility logic; routes to select-service or select-date |
| `app/(tabs)/book/select-service.tsx` | Service selection screen |
| `app/(tabs)/book/select-date.tsx` | Calendar |
| `app/(tabs)/book/select-time.tsx` | Time slots |
| `app/(tabs)/book/confirm.tsx` | Review + submit |
| `app/(tabs)/book/confirmed.tsx` | Success + cache invalidation |
| `hooks/useCertificate.ts` | Certificate state + `CertInfo` (includes `appliesToAllProducts`, `productIDs`) |

---

## Key Invariants

- **Appointment type IDs are never hardcoded in UI components.** They flow
  from backend config → `location.appointmentTypeIDs` → eligibility filter →
  URL params → availability/booking API calls.

- **Both platforms consume the same backend config.** Web and mobile call
  `GET /api/booking/config` and derive eligible types identically. The
  eligibility function logic is identical in both (see
  `src/lib/bookingEligibility.ts` and `app/(tabs)/book/index.tsx`).

- **The backend is always the final authority.** Client eligibility filtering
  controls what the UI shows, not what Acuity accepts. A member who somehow
  reaches the confirm screen with an ineligible type will receive a booking
  error from the backend.

- **Free Trial is unchanged.** It remains an external Acuity URL opened in a
  browser. It is not affected by `appointmentTypeIDs` configuration.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ACUITY_OWNER_ID` | `36930698` | Acuity account owner ID |
| `ACUITY_TYPE_WORKOUT_FOR_1` | `83398355` | Appointment type ID for Workout for 1 |
| `ACUITY_TYPE_RED_LIGHT_THERAPY` | `96690076` | Appointment type ID for Red Light Therapy |
| `ACUITY_TYPE_FREE_TRIAL` | `83397899` | Appointment type ID for Free Trial |
| `LOCATION_1_NAME` | `POTOMAC` | Display name for location 1 |
| `LOCATION_1_CALENDAR_ID` | `12741713` | Acuity calendar ID for location 1 |
| `LOCATION_1_APPOINTMENT_TYPE_IDS` | `83398355` | Comma-separated type IDs for location 1 |
| `LOCATION_2_NAME` | `KENTLANDS` | Display name for location 2 |
| `LOCATION_2_CALENDAR_ID` | `14311114` | Acuity calendar ID for location 2 |
| `LOCATION_2_APPOINTMENT_TYPE_IDS` | `83398355,96690076` | Comma-separated type IDs for location 2 |
