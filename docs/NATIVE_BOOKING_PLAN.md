# FitClub Native Booking — Implementation Plan

> **Analysis and planning only. No application code, dependencies, routes, or behavior were changed.**
> This document is the authoritative reference for implementing a native FitClub booking experience.

---

## 1. Current Booking Architecture

The app is a **hybrid**: most scheduling actions are fully native (cancel, reschedule, appointment list), but the actual booking form is delegated to Acuity's hosted scheduling page in an external browser.

```
Member taps "Book Now"
        │
        ▼
App constructs an Acuity URL (owner ID + calendar ID + email + certificate)
        │
        ▼
  [Mobile]  WebBrowser.openBrowserAsync(url)   ← in-app browser panel
  [Web]     <a target="_blank" href={url}>      ← new browser tab
        │
        ▼
Acuity's own scheduling UI (Acuity branding, Acuity date/time picker, Acuity form)
        │
        ▼
Member completes booking in Acuity
        │
        ▼
  [Mobile]  Browser dismissed → app compares appointment IDs → shows "You're booked!" banner
  [Web]     No signal — member must manually return and refresh
```

**Everything else** — viewing appointments, cancelling, rescheduling — is 100% native and talks directly to the API server.

---

## 2. Current Booking Flow (Step by Step)

### Mobile (`artifacts/fit-club-mobile/app/(tabs)/book.tsx`)

| Step | What happens | Code location |
|---|---|---|
| 1 | Member opens the Book tab | `app/(tabs)/book.tsx` — `BookScreen` component |
| 2 | Screen fetches Acuity config on load | `configQuery` → `GET /api/booking/config` (staleTime: 10 min) |
| 3 | Screen fetches member certificates | `certsQuery` → `GET /api/booking/certificates` |
| 4 | Member optionally taps a membership card or types a code | `useCertificate` hook → `GET /api/booking/certificates/check` |
| 5 | Member taps "Book Now" on a location card | `handleBook(locationId, calendarId, name)` — line 157 |
| 6 | `acuityUrl()` builds the Acuity scheduling URL | `acuityUrl()` — line 41–60 |
| 7 | `WebBrowser.openBrowserAsync(url)` opens in-app browser | line 167 — dismissButtonStyle: 'close', gold controls |
| 8 | Member completes booking inside Acuity's UI | External — app has no visibility |
| 9 | Member closes the browser (or taps "Close") | `WebBrowser.openBrowserAsync` promise resolves |
| 10 | App refetches upcoming appointments + certificates | `queryClient.refetchQueries()` — lines 178–181 |
| 11 | App compares appointment IDs before/after to detect new booking | lines 182–184 |
| 12 | If new booking found: shows "You're booked!" banner | `setNewBooking(detected)` — line 184 |

**URL constructed at step 6:**
```
https://app.acuityscheduling.com/schedule.php
  ?owner=<ownerId>
  &calendarID=<calendarId>
  &email=<member email>                         ← pre-filled, but editable by member
  [&certificate=<code>]                         ← only if valid certificate applied
  [&appointmentType=<id>]                       ← Potomac: Workout for 1 only
  [&appointmentType[]=<id1>&appointmentType[]=<id2>]  ← Kentlands: W1 + Red Light
```

**Free Trial CTA** (separate, line 229–245): Opens `schedule.php?owner=...&appointmentType=<freeTrial>` directly via `WebBrowser.openBrowserAsync`. No certificate, no location selection.

### Web Portal (`artifacts/fit-club-portal/src/pages/Book.tsx`)

Same overall flow, with two key differences:
1. Location cards are `<a target="_blank">` links — clicking opens Acuity in a new browser tab (not an in-app panel)
2. **Email is NOT pre-filled** in the portal's `acuityUrl()` function (line 18–33) — mobile includes `&email=...`, web does not
3. No post-booking detection — the portal has no mechanism to know when the member returns from Acuity

---

## 3. Existing Acuity API Functionality

All backend Acuity logic lives in two files. Every endpoint listed below already exists and works in production.

### `artifacts/api-server/src/routes/booking.ts`

| Route | Function | What it does | Acuity call |
|---|---|---|---|
| `GET /api/booking/config` | inline handler | Returns ownerId + appointmentType IDs + locations from env vars | None (env only) |
| `GET /api/booking/locations` | inline handler | Returns `[{id, name}]` for the two studios | None (env only) |
| `GET /api/booking/appointment-types` | inline handler | Lists all active, non-hidden Acuity appointment types | `GET /appointment-types` |
| `GET /api/booking/availability/dates` | inline handler | Available dates in a given month for a location + type | `GET /availability/dates?appointmentTypeID&calendarID&month&timezone` |
| `GET /api/booking/availability/times` | inline handler | Available time slots for a specific date | `GET /availability/times?appointmentTypeID&calendarID&date&timezone` |
| `GET /api/booking/certificates` | inline handler | Member's active packages (filtered: remainingValue > 0) | `GET /certificates?email=<clerk email>` |
| `GET /api/booking/certificates/check` | inline handler | Validates a certificate code; email lookup first, code fallback | `GET /certificates?email=` then `GET /certificates?certificate=` |
| `POST /api/booking/appointments` | inline handler | **Creates appointment.** Identity (name, email) pulled from Clerk — not trusted from body | `POST /appointments` |

**`POST /api/booking/appointments` request body:**
```json
{
  "locationId": "1",
  "appointmentTypeID": "12345678",
  "datetime": "2026-08-20T09:00:00-0400",
  "phone": "optional",
  "notes": "optional",
  "certificate": "OPTIONAL-CODE"
}
```

**`POST /api/booking/appointments` response:**
```json
{
  "id": 987654321,
  "type": "Workout for 1",
  "date": "2026-08-20",
  "time": "2026-08-20T09:00:00-0400",
  "calendar": "POTOMAC",
  "location": null,
  "confirmationPage": "https://acuityscheduling.com/..."
}
```

### `artifacts/api-server/src/routes/appointments.ts`

| Route | What it does | Acuity call |
|---|---|---|
| `GET /api/appointments/upcoming` | Lists future appointments for this member by email | `GET /appointments?email=&minDate=` |
| `GET /api/appointments/past` | Lists past appointments | `GET /appointments?email=&maxDate=` |
| `GET /api/appointments/summary` | Count + next appointment | Two parallel Acuity fetches |
| `DELETE /api/appointments/:id` | Cancel (verifies ownership first) | `GET /appointments/:id` then `PUT /appointments/:id/cancel` |
| `GET /api/appointments/:id/times` | Available reschedule slots for existing appointment's type+calendar | `GET /availability/times?appointmentTypeID&calendarID&date` |
| `PUT /api/appointments/:id` | Reschedule to new datetime (verifies ownership first) | `GET /appointments/:id` then `PUT /appointments/:id/reschedule` |

### Summary: Does the backend already support a native booking flow?

| Capability | Exists? | Route |
|---|---|---|
| Get appointment types | ✅ | `GET /api/booking/appointment-types` |
| Get locations/calendars | ✅ | `GET /api/booking/locations` + `GET /api/booking/config` |
| Get available dates | ✅ | `GET /api/booking/availability/dates` |
| Get available times | ✅ | `GET /api/booking/availability/times` |
| Create appointment | ✅ | `POST /api/booking/appointments` |
| Cancel appointment | ✅ | `DELETE /api/appointments/:id` |
| Reschedule appointment | ✅ | `PUT /api/appointments/:id` |
| Get member certificates | ✅ | `GET /api/booking/certificates` |
| Validate a certificate code | ✅ | `GET /api/booking/certificates/check` |
| Apply certificate to booking | ✅ | `POST /api/booking/appointments` body: `certificate` |
| Eligible types from certificate | ✅ | `GET /api/booking/certificates` returns `appointmentTypeIDs[]` |
| Get client/member info | ✅ (via Clerk) | Server reads from Clerk automatically |
| Handle Acuity errors | ✅ | All routes return 422 with Acuity's error message |

**The backend is complete. Zero backend changes are required for a native booking flow.**

---

## 4. Existing Functionality We Should Reuse

The following pieces already exist and should be carried forward without rebuilding:

### Backend (zero changes needed)
- `POST /api/booking/appointments` — the final booking API call; fully implemented, identity-locked
- `GET /api/booking/availability/dates` — date availability, already accepts locationId + appointmentTypeID + month
- `GET /api/booking/availability/times` — time slot list, same params plus date
- `GET /api/booking/certificates` — member's active packages with remainingValue
- `GET /api/booking/certificates/check` — certificate validation logic (email-first + code fallback)
- `GET /api/booking/config` — Acuity IDs and location config
- All appointment read/cancel/reschedule routes

### Mobile frontend
- `useCertificate` hook (`hooks/useCertificate.ts`) — code input state machine, debounce, validation API call
- `useAppForegroundRefresh` hook — invalidates React Query keys on foreground return
- `RescheduleModal.tsx` — **the date strip + time slot grid pattern.** This is the direct template for the new booking flow's date and time steps. Reuse the layout, query pattern, `currentDateKey` race-condition guard, and slot grid rendering.
- Certificate selection UI from `book.tsx` (the "YOUR MEMBERSHIPS" section and code input) — carry this into the new booking flow
- `SvgIcon` component — all needed icons already exist
- `friendlyError` utility — error message mapping
- `useColors` hook + color constants — full design system already in place
- `queryClient` cache invalidation patterns — existing keys are correct

### Web portal frontend
- `useMemberCertificates`, `useCertificateCheck`, `useAcuityConfig` hooks from `useBookingApi.ts`
- Certificate selection UI from `Book.tsx` — the packages list + code input
- `useAppointmentActions.ts` — times fetching pattern is the same
- shadcn/ui component library — Button, Card, Dialog, Skeleton, etc.
- Tailwind color tokens — design system is consistent

---

## 5. Current Acuity Handoff

### Mobile

**What triggers it:** Member taps the "Book Now" button on a location card in `BookScreen`.

**Which component does it:** `BookScreen` in `app/(tabs)/book.tsx`, function `handleBook()` at line 157, calling `WebBrowser.openBrowserAsync()` at line 167.

**What information is passed to Acuity (via URL params):**
| Param | Value | Notes |
|---|---|---|
| `owner` | Acuity owner ID | From `/api/booking/config` |
| `calendarID` | Location's Acuity calendar ID | Pre-selected based on card tapped |
| `email` | Member's Clerk primary email | Pre-filled, but Acuity allows member to change it |
| `certificate` | Certificate code (if valid) | Optional |
| `appointmentType` or `appointmentType[]` | Type ID(s) | Only included when a certificate is applied; restricts Acuity's selector |

**How:** In-app browser panel (`expo-web-browser`). Not an iframe, not a redirect — a native OS browser component slides up over the app. Member stays "in" the app visually but is interacting with Acuity's UI.

**Member information passed through:** Email only (pre-filled). Name and phone are NOT passed — member must type them into Acuity's form.

**Is appointment type known before handoff?** Only partially. The `calendarID` selects the location. `appointmentType` is pre-filtered only when a certificate is applied. Without a certificate, all types for that calendar are shown.

### Web Portal

**What triggers it:** Member clicks a location card `<a>` element in `Book.tsx` (line 248–284).

**Which component does it:** `Book` page in `src/pages/Book.tsx`, the location card's `href` constructed by `acuityUrl()` at line 18–33.

**How:** Standard `<a target="_blank">` link. Opens a new browser tab. The portal page stays open in the original tab.

**Member information passed through:** None (email is NOT included in the web portal's `acuityUrl()` — this differs from mobile). Member must fill in name, email, and phone on Acuity's form from scratch.

**Post-booking:** No detection. Member must manually close the Acuity tab, return to the portal, and refresh to see the new appointment.

---

## 6. Member Context Already Available

When a signed-in member starts the booking flow, the app already has:

| Data | Available? | Source |
|---|---|---|
| Clerk user ID | ✅ | `useAuth().userId` (mobile), Clerk session (web) |
| Email | ✅ | `useUser().user.primaryEmailAddress.emailAddress` |
| First name | ✅ | `useUser().user.firstName` |
| Last name | ✅ | `useUser().user.lastName` |
| Active membership packages | ✅ | `GET /api/booking/certificates` |
| Certificate codes | ✅ | Same endpoint — `code` field |
| Sessions remaining | ✅ | `remainingValue` from certificates endpoint |
| Eligible appointment type IDs | ✅ | `appointmentTypeIDs[]` from certificates endpoint |
| Preferred location | ⚠️ | Stored in AsyncStorage (mobile) — present but not read on Book screen |
| Appointment history | ✅ | `GET /api/appointments/upcoming` + `/past` |
| Phone number | ❌ | Not stored in Clerk, not in the app. Must be collected at booking if required. |
| Assigned coach/trainer | ❌ | Not tracked anywhere in the application |
| 2FA / auth method | N/A | Not relevant to booking |

**Practical implication for the native flow:** The confirm screen can pre-fill name and email (from Clerk) without asking the member. Phone is the only field that may need to be collected, and it's optional in Acuity's API (`POST /booking/appointments` body) — if Acuity requires it, a phone field on the Confirm screen is the right place.

---

## 7. Current UI Components

### Components that exist today

| Component | Mobile | Web |
|---|---|---|
| Book / "Book Now" button | ✅ Location card in `book.tsx` | ✅ Location card `<a>` in `Book.tsx` |
| Scheduling page (current) | ✅ `book.tsx` (full screen) | ✅ `Book.tsx` (full page) |
| Service selection UI | ❌ Does not exist | ❌ Does not exist |
| Date selection | ✅ 14-day strip in `RescheduleModal.tsx` | ✅ Same component used via portal's reschedule (if exposed) |
| Time slot grid | ✅ In `RescheduleModal.tsx` | ✅ Portal has same pattern in appointment actions |
| Booking confirmation (native) | ⚠️ Dismissible banner on Book tab only | ❌ Does not exist |
| Loading states | ✅ `ActivityIndicator`, skeleton cards | ✅ `Loader2` spinner, `animate-pulse` skeleton |
| Error states | ✅ `friendlyError()` + inline error text | ✅ React Query error state + inline banners |
| Empty availability state | ✅ "No times available" in RescheduleModal | ✅ Same |
| Certificate/package selector | ✅ Packages list + code input in `book.tsx` | ✅ Packages list + code input in `Book.tsx` |

### Components that need to be built

| Component | Notes |
|---|---|
| Service selector screen | "Choose Service" — list of appointment types for the selected location. For members with a certificate, filtered to `appointmentTypeIDs[]`; otherwise all types for that calendar. |
| Month-view calendar | The RescheduleModal uses a 14-day strip (today + 13 days). A booking flow needs to show a full month with navigation for further-out dates. Can start with the same 14-day strip and expand later. |
| Confirm booking screen | Shows: service, date, time, location, member name (read-only), email (read-only), certificate applied. Submit calls `POST /api/booking/appointments`. |
| Native confirmation screen | "You're booked!" as a dedicated screen (not just a dismissible banner) with appointment summary and "View in Sessions" CTA. |

---

## 8. Recommended Architecture

**Approach: Native frontend + Acuity API backend (no change to the backend)**

- Keep Acuity as the scheduling engine and source of truth
- Build native screens for every step of the booking flow
- Use `POST /api/booking/appointments` as the only point where Acuity is called during booking
- The Acuity-hosted scheduling page is removed from the main booking flow
- The external browser link is kept only for the "Book a Free Trial" CTA and the "Purchase a Membership" path (membership purchase cannot be done via API)

**Authentication and security:**
- No changes to auth
- Identity (name, email) continues to be derived from Clerk server-side
- Certificate code continues to be validated server-side before being passed to Acuity
- Acuity credentials remain server-side only

---

## 9. Proposed Native Booking Flow

```
[Step 1 — Location] (existing screen)
  BookScreen / Book page
  Member sees two location cards (Potomac / Kentlands)
  Member's preferred location is highlighted (read from AsyncStorage)
  Tapping a card → navigates to Step 2 (instead of opening Acuity)

[Step 2 — Service]  ← NEW SCREEN
  "Choose Service" screen
  Shows appointment types available at the chosen location:
    - If a certificate is applied: filtered to cert.appointmentTypeIDs[]
    - If no certificate: show all types for that calendar (W1, Red Light if Kentlands, etc.)
  Member taps a service → navigates to Step 3

[Step 3 — Date]  ← NEW SCREEN (extends RescheduleModal pattern)
  "Choose a Date" screen
  Calls: GET /api/booking/availability/dates?locationId=&appointmentTypeID=&month=YYYY-MM
  Displays available dates (start with 14-day strip; expand to month calendar later)
  Loading state: skeleton strip
  Empty state: "No availability this month — try next month"
  Member taps a date → navigates to Step 4

[Step 4 — Time]  ← NEW SCREEN (reuses RescheduleModal slot grid)
  "Choose a Time" screen
  Calls: GET /api/booking/availability/times?locationId=&appointmentTypeID=&date=YYYY-MM-DD
  Displays time slot grid
  Loading state: skeleton slots
  Empty state: "No times available on this date — pick another"
  Member taps a slot → navigates to Step 5

[Step 5 — Confirm]  ← NEW SCREEN
  "Review Your Booking" screen
  Displays:
    Service name + duration
    Location name
    Date + time (formatted)
    Member name (from Clerk, read-only)
    Member email (from Clerk, read-only)
    Certificate applied (if any, with remaining sessions after booking)
    Phone field (optional text input — only if Acuity requires it)
  "Confirm Booking" button
  Calls: POST /api/booking/appointments
    { locationId, appointmentTypeID, datetime, certificate? }
  On success → Step 6
  On error → inline error message with retry

[Step 6 — Confirmation]  ← NEW SCREEN (replaces the dismissible banner)
  "You're booked!"
  Displays: service, date, time, location
  "View in Sessions" button → navigates to Appointments tab
  "Book another" button → back to Step 1
  React Query invalidation: upcoming appointments + certificates
```

**Free Trial** (stays as Acuity external link — acceptable exception):
```
"Book a Free Trial" CTA
  → WebBrowser.openBrowserAsync (mobile) / <a target="_blank"> (web)
  → Acuity's scheduling page with appointmentType=<freeTrial>
```

---

## 10. Recommended First Code Change

**Build the "Choose a Date → Choose a Time → Confirm → Booked" flow for mobile, triggered from the existing location card tap, for the primary service (Workout for 1).**

This is the smallest complete change that eliminates the external browser handoff for the most common booking scenario:

### Specifically:

1. **In `app/(tabs)/book.tsx`:** Change `handleBook()` so that instead of calling `WebBrowser.openBrowserAsync()`, it navigates to a new `book/select-time` screen, passing `locationId`, `calendarId`, and `appointmentTypeID` (default: Workout for 1 ID from config) as params.

2. **Create `app/(tabs)/book/select-time.tsx`** (new stack screen): Date strip (14-day, reuse `RescheduleModal` pattern) + time slot grid. Calls `/api/booking/availability/dates` and `/api/booking/availability/times`. On slot selection → navigates to confirm.

3. **Create `app/(tabs)/book/confirm.tsx`** (new stack screen): Review screen with pre-filled name, email, selected service/date/time, and certificate. "Confirm Booking" calls `POST /api/booking/appointments`. On success → navigate to confirmation.

4. **Create `app/(tabs)/book/confirmed.tsx`** (new stack screen): Native confirmation screen. "View Sessions" → tabs/sessions. "Book Again" → back to book.

5. **Keep the existing Acuity URL path** temporarily as a fallback (e.g., an `openInAcuity()` escape hatch in case the native flow encounters an error). Remove it in a later step once the native flow is confirmed stable.

### What this does NOT change:
- Service selection (Workout for 1 is the default; full service selector can be Step 2 in a follow-on change)
- Free Trial CTA (stays as Acuity link)
- Membership purchase (stays as Acuity catalog link)
- Cancel flow (already native — untouched)
- Reschedule flow (already native — untouched)
- Web portal (separate change, same pattern)
- Any API endpoint
- Any authentication
- Any database schema
- Any unrelated screen or feature

---

## 11. Files That Would Change in the First Step

### Mobile — files to modify
| File | Change |
|---|---|
| `artifacts/fit-club-mobile/app/(tabs)/book.tsx` | Change `handleBook()` to navigate instead of opening browser. Keep Acuity URL as fallback. |
| `artifacts/fit-club-mobile/app/(tabs)/_layout.tsx` | May need to change the Book tab from a single screen to a stack navigator (or use a modal stack) |

### Mobile — files to create
| File | Purpose |
|---|---|
| `artifacts/fit-club-mobile/app/(tabs)/book/index.tsx` | Move current book screen here (or keep as-is if structure allows) |
| `artifacts/fit-club-mobile/app/(tabs)/book/select-time.tsx` | Date strip + time slot screen |
| `artifacts/fit-club-mobile/app/(tabs)/book/confirm.tsx` | Review + confirm screen |
| `artifacts/fit-club-mobile/app/(tabs)/book/confirmed.tsx` | Success screen |

### Web portal — files to modify (separate step, after mobile is stable)
| File | Change |
|---|---|
| `artifacts/fit-club-portal/src/pages/Book.tsx` | Replace `<a target="_blank">` cards with onClick handlers that enter the native flow |
| `artifacts/fit-club-portal/src/App.tsx` | Add routes for `/book/select-time`, `/book/confirm`, `/book/confirmed` (or use Wouter nested routes / dialog approach) |

### Web portal — files to create (separate step)
| File | Purpose |
|---|---|
| `src/pages/book/SelectTime.tsx` | Date picker + time slots |
| `src/pages/book/Confirm.tsx` | Review + confirm |
| `src/pages/book/Confirmed.tsx` | Success screen |

---

## 12. Files That Must NOT Change

| File | Reason |
|---|---|
| All `artifacts/api-server/src/routes/*` | Backend is complete and does not need modification |
| `artifacts/api-server/src/config/acuity.ts` | Acuity ID config is correct |
| `artifacts/api-server/src/app.ts` | Express setup, CORS, Clerk middleware — untouched |
| `artifacts/fit-club-mobile/app/(auth)/*` | Authentication — completely separate concern |
| `artifacts/fit-club-mobile/app/(tabs)/appointments.tsx` | Already native — untouched |
| `artifacts/fit-club-mobile/app/(tabs)/profile.tsx` | Unrelated — untouched |
| `artifacts/fit-club-mobile/components/RescheduleModal.tsx` | Reuse as a template, do not modify |
| `artifacts/fit-club-mobile/hooks/useAppointmentActions.ts` | Cancel/reschedule — untouched |
| `lib/db/src/schema/index.ts` | No database changes |
| `artifacts/fit-club-portal/src/pages/Appointments.tsx` | Unrelated — untouched |
| `artifacts/fit-club-portal/src/pages/Dashboard.tsx` | Unrelated — untouched |
| Any Clerk configuration | Authentication — untouched |
| Any environment variables / secrets | Acuity credentials — server-side only, untouched |

---

## 13. Safety Requirements

Before any code is written:

- ✅ Do not expose Acuity API keys — all credentials remain server-side in `booking.ts`
- ✅ Do not move secrets to the frontend — `POST /api/booking/appointments` derives identity from Clerk
- ✅ Do not change authentication — Clerk JWT flow is unchanged
- ✅ Do not change the database schema — no schema changes needed or planned
- ✅ Do not remove the existing Acuity booking flow yet — keep as a fallback until the native flow is confirmed stable in production
- ✅ Do not break mobile while modifying web — implement mobile first; web is a separate follow-on step
- ✅ Do not modify unrelated features — only files listed in "Files That Would Change" are touched
- ✅ Do not install unnecessary dependencies — the date/time picker can be built with the same pattern as `RescheduleModal` (no new library needed for the initial 14-day strip)

---

## 14. Summary

### What was found
The FitClub app has a **fully functional Acuity API integration** on the backend that already supports everything a native booking flow needs — availability dates, availability times, appointment creation, certificate validation. The only missing piece is the native frontend flow; the backend does not need to change.

### Current booking flow
Member taps a location card → app builds an Acuity URL → external browser opens → member books in Acuity's UI → browser closes → app detects new booking (mobile only).

### Exact files involved in the current handoff
- **Mobile handoff:** `artifacts/fit-club-mobile/app/(tabs)/book.tsx` — `handleBook()` function, `acuityUrl()` function, `WebBrowser.openBrowserAsync()` call
- **Web handoff:** `artifacts/fit-club-portal/src/pages/Book.tsx` — location card `<a target="_blank" href={acuityUrl(...)}>` elements

### Existing APIs we can reuse (no backend changes needed)
`GET /api/booking/availability/dates` · `GET /api/booking/availability/times` · `POST /api/booking/appointments` · `GET /api/booking/certificates` · `GET /api/booking/certificates/check` · `GET /api/booking/config`

### Recommended first implementation step
**Replace the `WebBrowser.openBrowserAsync()` call in mobile `book.tsx` with navigation to a new stack of native screens: date picker → time slots → confirm → success.** Reuse the `RescheduleModal` date strip and slot grid pattern. The backend is ready. Mobile first; web in a separate follow-on step.

### Exact files to modify in that step
1. `artifacts/fit-club-mobile/app/(tabs)/book.tsx` — change `handleBook()` to navigate
2. `artifacts/fit-club-mobile/app/(tabs)/_layout.tsx` — add stack navigator for book sub-screens (if needed)
3. *(Create)* `artifacts/fit-club-mobile/app/(tabs)/book/select-time.tsx`
4. *(Create)* `artifacts/fit-club-mobile/app/(tabs)/book/confirm.tsx`
5. *(Create)* `artifacts/fit-club-mobile/app/(tabs)/book/confirmed.tsx`
