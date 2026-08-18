# Fit Club 15 — Acuity Scheduling Integration

> Deep-dive reference for developers working on the scheduling integration.
> Production URL: https://client-dashboard-fitclub.replit.app

---

## 1. Current Architecture: Summary

The app uses **Acuity's REST API v1 with HTTP Basic authentication** (owner-level credentials). This is the highest tier of Acuity API access — not a public embed, not OAuth.

For **booking**, the app takes a hybrid approach:
- The **availability check, certificate validation, and appointment list** are fully handled via API (native UI in the app).
- The **actual booking form** is handed off to Acuity's hosted scheduling page, opened in an in-app browser (mobile) or new browser tab (web portal). This is the key architectural tension in the current design.

For **cancel and reschedule**, those flows are **fully native** — the app presents its own UI and calls the Acuity API directly. No external browser is involved.

---

## 2. Authentication / API Access

| Property | Value |
|---|---|
| Authentication type | HTTP Basic Auth (`ACUITY_USER_ID:ACUITY_API_KEY`) |
| API base URL | `https://acuityscheduling.com/api/v1` |
| Required Acuity plan | Powerhouse or equivalent (API access required) |
| Credential storage | Replit Secrets (server-side only; never sent to clients) |

The API key is used exclusively on the server (`artifacts/api-server/`). Clients receive a Clerk JWT, which the server verifies before making any Acuity call on their behalf.

---

## 3. Environment Variables

All Acuity-related configuration lives in server-side environment variables. No Acuity credentials are in client-side code.

| Variable | Purpose |
|---|---|
| `ACUITY_USER_ID` | Numeric Acuity account/user ID (from Acuity → Integrations → API) |
| `ACUITY_API_KEY` | Acuity API key (from Acuity → Integrations → API) |
| `ACUITY_OWNER_ID` | Numeric owner ID — used in client-side scheduling page URLs (not secret, but configurable) |
| `ACUITY_TYPE_WORKOUT_FOR_1` | Appointment type ID for "Workout for 1" |
| `ACUITY_TYPE_RED_LIGHT_THERAPY` | Appointment type ID for "Red Light Therapy" (Kentlands only) |
| `ACUITY_TYPE_FREE_TRIAL` | Appointment type ID for "Free Trial" |
| `LOCATION_1_NAME` | Display name for location 1 (default: POTOMAC) |
| `LOCATION_1_CALENDAR_ID` | Acuity calendar ID for location 1 |
| `LOCATION_2_NAME` | Display name for location 2 (default: KENTLANDS) |
| `LOCATION_2_CALENDAR_ID` | Acuity calendar ID for location 2 |
| `BOOKING_TIMEZONE` | Timezone for availability queries (default: `America/New_York`) |

Client-side env vars (mobile):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_DOMAIN` | API server domain (used to construct fetch URLs) |
| `EXPO_PUBLIC_LOCATION_1_NAME` | Location name displayed on the Profile screen |
| `EXPO_PUBLIC_LOCATION_2_NAME` | Location name displayed on the Profile screen |

---

## 4. Appointment Types and Calendars

Configured in `artifacts/api-server/src/config/acuity.ts`:

| Type | Variable | Notes |
|---|---|---|
| Workout for 1 | `ACUITY_TYPE_WORKOUT_FOR_1` | Available at both locations |
| Red Light Therapy | `ACUITY_TYPE_RED_LIGHT_THERAPY` | Kentlands only |
| Free Trial | `ACUITY_TYPE_FREE_TRIAL` | Shown to all visitors; no certificate required |

| Location | Variable | Notes |
|---|---|---|
| Potomac | `LOCATION_1_CALENDAR_ID` | Workout for 1 only (when certificate is applied) |
| Kentlands | `LOCATION_2_CALENDAR_ID` | Workout for 1 + Red Light Therapy |

The filtering of appointment types by location is applied when constructing the Acuity scheduling URL — Acuity's `?appointmentType[]=` query parameter pre-selects the allowed types in its scheduling UI.

---

## 5. Acuity API Endpoints Used

| Acuity Endpoint | Method | Our Route | Purpose |
|---|---|---|---|
| `/appointments` | GET | `/api/appointments/upcoming` | List member's upcoming appointments by email |
| `/appointments` | GET | `/api/appointments/past` | List member's past appointments by email |
| `/appointments` | GET | `/api/appointments/summary` | Count upcoming + past, return next appointment |
| `/appointments/:id` | GET | (internal, ownership check) | Verify appointment belongs to the requesting user |
| `/appointments/:id/cancel` | PUT | `DELETE /api/appointments/:id` | Cancel appointment |
| `/appointments/:id/reschedule` | PUT | `PUT /api/appointments/:id` | Reschedule to a new datetime |
| `/availability/dates` | GET | `/api/booking/availability/dates` | Available dates in a given month |
| `/availability/times` | GET | `/api/appointments/:id/times` + `/api/booking/availability/times` | Available time slots for a date |
| `/certificates` | GET | `/api/booking/certificates` + `/api/booking/certificates/check` | Member's packages and code validation |
| `/appointment-types` | GET | `/api/booking/appointment-types` | List all active appointment types |
| `/appointments` | POST | `POST /api/booking/appointments` | Create a new appointment |

**Not used:**
- Acuity webhooks (no inbound handlers exist)
- Acuity OAuth
- Acuity iframes or embed codes
- Acuity's client/contact API

---

## 6. Current Booking Flow (Step by Step)

### 6a. Member Books a Session (Mobile)

```
User taps "Book Now" on a location card
  │
  ├─► [book.tsx] Member has optionally selected a certificate/membership code
  │     useCertificate hook → GET /api/booking/certificates/check
  │       → Server calls Acuity GET /certificates?email=... (email lookup)
  │       → Falls back to Acuity GET /certificates?certificate=... (code lookup)
  │     Returns: { valid, productName, remainingValue }
  │
  ├─► [book.tsx] GET /api/booking/config (on screen load, cached 10 min)
  │     → Server reads config from env vars
  │     Returns: { ownerId, appointmentTypes, locations }
  │
  ├─► [book.tsx] Constructs Acuity URL:
  │     https://app.acuityscheduling.com/schedule.php
  │       ?owner=<ownerId>
  │       &calendarID=<calendarId for chosen location>
  │       &email=<member's Clerk email>
  │       [&certificate=<code>]
  │       [&appointmentType[]=<typeId(s)>]
  │
  ├─► [book.tsx] WebBrowser.openBrowserAsync(url)
  │     → In-app browser panel slides up (iOS Safari / Android Chrome engine)
  │     → Acuity renders its full scheduling UI (date picker, time picker, form)
  │     → Member completes booking in Acuity's UI
  │     → Browser is dismissed (member taps "Close" or "Done")
  │
  └─► [book.tsx] On browser close:
        → Invalidates React Query: ['/api/appointments/upcoming'], ['member-certificates']
        → Server fetches fresh data from Acuity
        → Compares appointment IDs before/after — detects new booking
        → Shows "You're booked!" confirmation banner
```

**Data stored locally:** None. Acuity is the source of truth. React Query cache holds the current view of Acuity data.

### 6b. Member Books a Session (Web Portal)

```
User clicks a location card on /book
  │
  ├─► [Book.tsx] Same config + certificate fetch as mobile
  │
  ├─► [Book.tsx] Location card is an <a target="_blank"> link
  │     → Browser opens a NEW TAB with the Acuity scheduling page
  │     → Member completes booking in Acuity's UI in that tab
  │     → Member manually closes the tab and returns to the portal
  │
  └─► No automatic refresh — member must manually refresh the dashboard
```

**Gap:** The web portal has no mechanism to detect when the member returns from Acuity. The appointment list does not auto-refresh after booking on web.

### 6c. Cancel (Both Platforms)

```
User taps "Cancel" on an appointment card
  │
  ├─► Native alert / confirm dialog shown (24h policy warning)
  │
  ├─► User confirms
  │     → [useAppointmentActions] DELETE /api/appointments/:id
  │         → Server: GET /appointments/:id (verify ownership by email)
  │         → Server: PUT /appointments/:id/cancel (Acuity API)
  │     Returns: { success: true }
  │
  └─► React Query invalidated immediately
        + Second invalidation after 4 seconds (Acuity restores session credit asynchronously)
```

**All native. No external browser.** Confirmation displayed as a system Alert on mobile, inline state on web.

### 6d. Reschedule (Both Platforms)

```
User taps "Reschedule" on an upcoming appointment card
  │
  ├─► [RescheduleModal] Slides up as bottom sheet
  │
  ├─► Member selects a date from 14-day horizontal date picker
  │     → GET /api/appointments/:id/times?date=YYYY-MM-DD
  │         → Server: GET /appointments/:id (verify ownership)
  │         → Server: GET /availability/times?appointmentTypeID=...&calendarID=...&date=...
  │     Time slots rendered as a grid
  │
  ├─► Member selects a time slot, taps "Confirm"
  │     → PUT /api/appointments/:id { datetime }
  │         → Server: GET /appointments/:id (verify ownership again)
  │         → Server: PUT /appointments/:id/reschedule { datetime }
  │     Returns: { success: true, datetime }
  │
  └─► React Query invalidated, modal closes, list refreshes
```

**All native. No external browser.**

### 6e. Purchase a Membership

```
User taps "Memberships" tab (mobile) or "Purchase a Membership" button (web)
  │
  └─► System browser opens:
        https://app.acuityscheduling.com/catalog.php?owner=36930698
        → Acuity's membership catalog (full page, Acuity branding)
        → Member selects package, enters payment info, completes purchase
        → Returns to app manually
```

**Full handoff to Acuity.** No API involvement, no data sync, no in-app browser on mobile (system browser opens, app goes to background).

---

## 7. How Client Identity is Passed to Acuity

- **For listing appointments:** The server looks up the member's email from Clerk (`clerkClient.users.getUser(userId)`), then calls `GET /appointments?email=<email>`. Acuity identifies the member by email.
- **For booking via URL:** The member's email is embedded in the scheduling URL as `&email=<email>` so Acuity pre-fills the email field. However, Acuity's form still allows the member to change this field before submitting.
- **For API-created appointments (`POST /booking/appointments`):** The server pulls `firstName`, `lastName`, and `email` from Clerk — the client cannot inject different identity values.
- **Phone, notes:** Passed from client request body (not verified against Clerk).

---

## 8. Data Synchronisation

**Acuity is the sole database for appointments.** This app has no appointment table in its database (`lib/db/src/schema/index.ts` exports nothing). Every list, count, and detail view is a live fetch from Acuity.

| What | How | Cache TTL |
|---|---|---|
| Upcoming appointments | Fetched from Acuity on demand | React Query default staleTime (0) — refetches on focus/foreground |
| Past appointments | Fetched from Acuity on demand | Same |
| Appointment summary (counts) | Two parallel Acuity fetches | Same |
| Member certificates | Fetched from Acuity by email | staleTime: 0 — always fresh |
| Acuity config (IDs) | Read from env vars (no Acuity call) | staleTime: 10 min |

**Webhooks:** None implemented. If Acuity changes an appointment externally (e.g., staff cancels or moves it), the app will not know until the next manual refresh or foreground return.

---

## 9. Current Problems

### P1 — Booking hands off to Acuity's UI (highest impact)
The booking form is rendered entirely by Acuity in an external browser. Members see Acuity's own UI, branding, and flow. On mobile this is an in-app browser panel (less jarring); on web it opens a new tab, which feels like leaving the app entirely. The member may not return. There is no post-booking confirmation or redirect back into the app on web.

### P2 — No post-booking confirmation on web
The web portal has no mechanism to detect that a booking was completed. The mobile app compares appointment IDs before/after the browser closes. The web portal cannot do this because opening a new tab gives the current page no signal when the tab closes or when Acuity's form completes.

### P3 — Acuity email form field is not locked
When opening Acuity's scheduling page with `&email=<email>`, Acuity pre-fills the email but does not prevent the member from changing it. A member could book under a different email and the appointment would not appear in the app.

### P4 — No webhook / real-time sync
Staff actions in Acuity (cancellations, schedule changes, notes) are invisible to the app until the next manual refresh. There is no push mechanism, no webhooks, and no polling.

### P5 — Membership purchase is a full external handoff
Purchasing a membership opens Acuity's catalog page in the system browser. The member leaves the app entirely. There is no in-app membership purchase flow, no post-purchase callback, and no confirmation when the member returns.

### P6 — Appointment type filtering only works when a certificate is applied
When a certificate is applied, the booking URL restricts appointment types by location (Potomac → Workout for 1 only; Kentlands → Workout for 1 + Red Light Therapy). When no certificate is applied, all appointment types for that calendar are shown — the member could accidentally select an irrelevant type.

### P7 — Web portal reschedule exposes cancel, but no post-reschedule success state
The RescheduleModal exists in both apps, but neither has a visible confirmation message after a successful reschedule — the modal just closes and the list silently refreshes.

### P8 — Acuity ID changes require a manual env var update
All Acuity appointment type and calendar IDs are stored in environment variables. Changing one requires accessing Replit Secrets. There is no staff-facing UI. (Task #27 exists to address this.)

---

## 10. Recommended Architecture

**Recommendation: Option C — Custom Frontend + Acuity as Backend Engine**

Keep Acuity as the scheduling engine (availability, appointment creation, cancellation, certificates). Replace Acuity's hosted UI with a fully native booking flow in the app.

### What already exists and can be reused

The API server (`booking.ts`) already exposes all the endpoints needed for a native booking flow:
- `GET /api/booking/availability/dates` — available dates for a month ✅
- `GET /api/booking/availability/times` — available time slots for a date ✅
- `GET /api/booking/certificates` — member's active packages ✅
- `GET /api/booking/certificates/check` — validate a certificate code ✅
- `POST /api/booking/appointments` — create appointment via Acuity API ✅

The reschedule modal (`RescheduleModal.tsx`) already demonstrates that a fully native date-picker + time-slot flow is possible and works well.

### What would need to be built

| Screen | Description |
|---|---|
| Service selector | Choose "Workout for 1", "Red Light Therapy", or "Free Trial" (filtered by location) |
| Date picker | Calendar view of available dates (uses existing `/availability/dates` endpoint) |
| Time picker | Available slots grid for selected date (uses existing `/availability/times` endpoint) |
| Confirm screen | Review: service, date, time, location, certificate applied, member details |
| Confirmation screen | Success state with appointment summary and "Add to calendar" option |

### Benefits

- Member never leaves the app's UI
- Acuity email field cannot be changed (server derives identity from Clerk)
- Confirmation is shown natively
- Appointment type filtering enforced server-side
- Certificate applied cleanly via `POST /booking/appointments { certificate }`
- Membership purchase remains the only external handoff (no Acuity API for store checkout)

### Estimated complexity

**Medium.** The backend is ~80% done. The primary work is building 3–4 new screens on mobile and 3–4 new pages/components on the web portal.

---

## 11. Proposed Future Booking Flow

```
[1] Book tab / Book page
    → Shows location cards (Potomac / Kentlands)
    → "Book a Free Trial" CTA (could remain as Acuity link for simplicity)
    → Member selects a location

[2] Choose Service
    → "Workout for 1" | "Red Light Therapy" (if Kentlands)
    → Membership packages shown and pre-selected if active
    → "No package? Browse memberships" link

[3] Choose Date
    → Calendar showing available dates (from /api/booking/availability/dates)
    → Loading state, empty state ("No availability this month")
    → Month navigation

[4] Choose Time
    → Time slot grid for selected date (from /api/booking/availability/times)
    → Loading state, "No times available — select another date"

[5] Confirm Booking
    → Service name, date, time, location, duration
    → Member name + email (pre-filled from Clerk, read-only)
    → Package applied (if any) with remaining sessions after this booking
    → "Confirm Booking" button

[6] Booking Confirmation
    → "You're booked!" with all details
    → "View in Sessions" button → navigates to Appointments tab
    → "Book another" → back to step 1

Backend call at step 5:
  POST /api/booking/appointments
  { locationId, appointmentTypeID, datetime, certificate? }
  → Server derives firstName, lastName, email from Clerk
  → Server calls Acuity POST /appointments
  → Returns { id, type, date, time, calendar, confirmationPage }
```

---

## 12. Migration Considerations

1. **No data migration needed.** Acuity remains the database. The only change is which UI renders the booking form.
2. **The API is already complete.** `POST /booking/appointments` exists and works. The work is entirely frontend.
3. **The `RescheduleModal` is a working template.** The date + time picker pattern already exists — the new booking flow extends it.
4. **Membership purchase cannot be moved into the app** without either building a Stripe/payment integration or using Acuity's checkout. The Acuity catalog link is acceptable for this step long-term.
5. **The Acuity scheduling URL path** (`book.tsx` line ~160, `Book.tsx` line ~25) can be removed after the native flow is live. Keep it temporarily as a deep-link fallback while the new flow is in testing.
6. **Deep links** (`fitclub15://book?certificate=<code>`) currently navigate to the Book tab. After the redesign, they should navigate directly to step 2 (Choose Service) with the certificate pre-applied.
