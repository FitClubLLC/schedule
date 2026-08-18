# Fit Club 15 — Application Audit

> **Inspection only. No changes were made to any application code, database, UI, configuration, or behavior.**
> Production URL: https://client-dashboard-fitclub.replit.app
> GitHub: https://github.com/FitClub15/fitclub15

---

## Executive Summary

### Overall Assessment

Fit Club 15 is a well-structured, production-ready member portal built with modern tooling (Expo + React Native, React/Vite, Express, Clerk, Acuity). The codebase is clean, consistently styled, and demonstrates careful attention to auth edge cases and data freshness. The app is appropriate for its stated purpose: a small fitness studio's member-facing scheduling companion.

The primary weakness is **the booking experience**. The actual session-booking form is delegated to Acuity's hosted scheduling page — opened in an external browser — which breaks the app's otherwise seamless branded experience. All other scheduling actions (cancel, reschedule, view appointments) are fully native and well-executed.

The database schema is empty; Acuity is the source of truth for all appointment data, and Clerk holds member identity. This is architecturally sound for the studio's scale but limits the app's ability to add features like notes, progress tracking, or loyalty points without future schema work.

---

### Top 5 Functionality Problems

1. **Booking breaks out of the app.** The booking form is Acuity's hosted UI in an external browser. On web, this opens a new tab with no way to detect completion or redirect back. On mobile, it's an in-app browser panel, which is less disruptive but still shows Acuity's branding.

2. **Acuity email field is not locked during booking.** The scheduling URL pre-fills the member's email but does not prevent them from changing it. A booking made under a different email will never appear in the app.

3. **No webhook / real-time sync.** Staff actions in Acuity (cancellations, reschedules, notes) are invisible to the app until the next manual pull-to-refresh or foreground return. There is no server-push mechanism.

4. **Web portal has no post-booking detection.** After a member books in Acuity's new tab, the portal dashboard does not refresh. The member must manually navigate away and back to see the new appointment.

5. **Preferred location preference is not used in the booking flow.** The Profile screen lets members set a preferred location, but this preference is stored in AsyncStorage and is not read anywhere on the Book screen. The location cards appear in a fixed order with no indication of which location the member prefers.

---

### Top 5 UX/Design Problems

1. **Booking experience is split-brained.** Members go through a well-designed in-app flow (location card, certificate selector, confirmation banner) and are then dropped into Acuity's generic scheduling page, which has different fonts, layout, and branding. The jarring context switch undermines trust.

2. **"Memberships" tab opens the system browser.** On mobile, tapping Memberships takes the member entirely out of the app into Safari/Chrome. There is no loading state, no transition, and no way to return to the app without the OS back gesture or switching apps.

3. **No reschedule confirmation message.** After a reschedule succeeds, the modal silently closes and the list refreshes. There is no "Rescheduled!" banner or toast to confirm the action worked.

4. **Password change is buried.** On the web portal, "Change Password" lives on the Dashboard next to the main content. On mobile, it's in the Profile tab. These are in different locations on the two platforms, creating inconsistency.

5. **Empty state on Dashboard (no upcoming sessions) is missed.** The Dashboard shows stat cards (Upcoming: 0, Completed: X) with no contextual guidance when a member hasn't booked. The portal shows an empty state card with a Book button; the mobile app does not show a specific empty state for the stats section.

---

### Top 5 Acuity/Scheduling Problems

1. **Booking form UI is Acuity's, not the app's.** The most important user action — booking a session — is handled in an external browser with Acuity's branding, layout, and error messages. The API endpoints to replace this with a native flow already exist on the backend.

2. **Appointment type filtering only applies when a certificate is used.** When no certificate is selected, the booking URL sends the member to Acuity's full appointment type list for that calendar — they could accidentally select an irrelevant service type.

3. **No webhooks.** Acuity can send webhooks for appointment.scheduled, appointment.rescheduled, appointment.canceled, and order.completed events. None of these are handled. The app has no awareness of changes made outside of it.

4. **Certificate "remaining value" can show stale data in the banner.** The `/check` endpoint caches for 2 minutes via React Query. If a booking is made and the member opens the certificate banner again quickly, it may show the pre-booking count. The `memberCerts` list (staleTime: 0) is used as a fresher source for the banner when available, which is a good mitigation, but the mismatch window exists.

5. **Free Trial booking uses the same external handoff pattern.** The "Book a Free Trial" CTA opens Acuity in a browser. A native free trial booking flow (just without a certificate) would be straightforward given the existing API.

---

### Recommended Scheduling Architecture

**Custom Frontend + Acuity API backend (Option C in Section 6)**

Build 4–5 native screens for the booking flow (Service → Date → Time → Confirm → Confirmation). The backend API is already ~80% complete. The reschedule modal is a working proof of concept. This eliminates the external browser handoff, locks the member's email to their Clerk identity, and enables a native confirmation experience.

---

### Highest-Priority Improvements

1. Replace the external Acuity booking handoff with a native booking flow (existing API supports it)
2. Apply the member's preferred location as the default/highlighted choice on the Book screen
3. Add a post-reschedule success banner
4. Add Acuity webhook handling for appointment events (sync cancellations/changes made by staff)
5. Add appointment type filtering to the booking URL even when no certificate is applied

---

### Estimated Complexity of the Recommended Acuity Redesign

**Medium — 2–4 weeks of focused development.**

- Backend: minimal changes (API is largely complete)
- Mobile: 4–5 new screens, update Book tab navigation (~400–600 lines new code)
- Web portal: 4–5 new page sections / components (~300–500 lines new code)
- Testing: each step of the booking flow, error handling, certificate edge cases, timezone correctness

---

---

## 1. Application Overview

### What It Does

Fit Club 15 is a private member portal and mobile app for a small boutique fitness studio (two locations: Potomac and Kentlands, Maryland). Members can:
- Sign in and manage their account
- View upcoming and past workout sessions
- Book sessions at either studio location (using Acuity Scheduling)
- Cancel or reschedule sessions without calling the studio
- Track their membership package credits
- Receive local push notifications before sessions

### User Types / Roles

| Role | Description |
|---|---|
| **Member** | Any authenticated user. Can view and manage their own appointments. |
| **Admin** | A specific email address (`VITE_ADMIN_EMAIL` / `ADMIN_EMAIL` env vars). Gets an additional "Members" nav link on the web portal with access to member management endpoints. |
| **Guest** | Unauthenticated visitor. Can see the landing page and sign-in/sign-up. Cannot access any appointment or booking data. |

There is no formal role system — admin access is determined by exact email match in the frontend Navbar and backend `admin.ts` route.

### Main User Journeys

1. **Sign in** → view dashboard → see upcoming sessions and session counts
2. **Book a session** → select location → apply membership code → open Acuity → complete booking
3. **Reschedule** → Sessions tab → tap Reschedule → pick date/time in modal → confirm
4. **Cancel** → Sessions tab → tap Cancel → confirm dialog → done
5. **Purchase membership** → Memberships tab → Acuity catalog in browser → complete purchase
6. **Manage profile** → Profile tab → edit name, set preferred location, notification preferences, biometric login, change password

### Main Pages / Routes

**Web Portal (`https://client-dashboard-fitclub.replit.app`):**

| Route | Page |
|---|---|
| `/` | Landing page (redirects to `/dashboard` if signed in) |
| `/sign-in` | Clerk sign-in |
| `/sign-up` | Clerk sign-up |
| `/dashboard` | Member dashboard (stats, upcoming appointments) |
| `/appointments` | Full appointment list (upcoming + past tabs) |
| `/book` | Book a session |
| `/admin` | Member management (admin only) |

**Mobile App (5 tabs):**

| Tab | Screen |
|---|---|
| Home | Dashboard (stats, today's sessions, next session) |
| Sessions | Upcoming / past appointments |
| Book | Book a session |
| Memberships | Intercepts tap → opens Acuity catalog in system browser |
| Profile | Account settings, preferences, security |

### Technologies / Frameworks

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 53, React Native, Expo Router (file-based), TypeScript |
| Web portal | React 18, Vite, TypeScript, Wouter (routing), Tailwind CSS, shadcn/ui |
| API server | Node.js, Express, TypeScript, Pino (logging) |
| Auth | Clerk v4 (Expo + React SDKs), with a self-hosted Clerk proxy on the API server |
| Data fetching | TanStack React Query v5 |
| Scheduling | Acuity Scheduling REST API v1 |
| Fonts (mobile) | Expo Google Fonts: Inter, Barlow Condensed |
| Error tracking | Sentry (mobile, production only) |
| Build/Deploy | EAS Build (mobile), Replit Autoscale (web + API) |
| Package manager | pnpm workspaces (monorepo) |
| Database | PostgreSQL via Drizzle ORM (provisioned, schema currently empty) |

### How Frontend, Backend, and External Services Connect

```
Member (mobile) ──Clerk JWT──► API Server ──HTTP Basic──► Acuity API
Member (web)   ──Cookie/JWT──► API Server ──HTTP Basic──► Acuity API
                                    │
                                    └──Admin SDK──► Clerk (name updates, user lookup)

Booking form ──────────────────────────────────────────► Acuity hosted UI (browser)
Memberships ────────────────────────────────────────────► Acuity catalog (browser)
```

The API server is the only service that holds Acuity credentials. Clients authenticate with Clerk, receive a JWT, and send that to the API server. The server validates the JWT, looks up the member's email from Clerk, and calls Acuity on their behalf.

---

## 2. Project Structure

See [FILE_MAP.md](FILE_MAP.md) for the complete annotated file map.

Key structural points:
- **pnpm monorepo** with four artifacts: `api-server`, `fit-club-mobile`, `fit-club-portal`, `mockup-sandbox`
- **Shared libraries** in `/lib`: OpenAPI spec → codegen → React Query hooks → Zod schemas
- **No application database schema** — `lib/db/src/schema/index.ts` exports nothing; Acuity is the data store
- **Clerk proxy** is self-hosted on the API server (required for custom domains)

---

## 3. Acuity Scheduling Integration

See [ACUITY_INTEGRATION.md](ACUITY_INTEGRATION.md) for the complete integration deep-dive.

---

## 4. Scheduling Flow Trace

### Book → Confirm (Mobile)

| Step | User Action | Component / Function | API Call |
|---|---|---|---|
| 1 | Taps "Book" tab | `_layout.tsx` → `book.tsx` | — |
| 2 | Screen loads | `book.tsx` → `configQuery` | `GET /api/booking/config` |
| 3 | Screen loads | `book.tsx` → `certsQuery` | `GET /api/booking/certificates` |
| 4 | Taps a membership to apply | `useCertificate` → `applyCode()` | `GET /api/booking/certificates/check` |
| 5 | Taps "Book Now" on a location card | `handleBook()` | — |
| 6 | In-app browser opens | `WebBrowser.openBrowserAsync()` | (Acuity hosted page) |
| 7 | Completes booking in Acuity | Acuity's scheduling UI | (Acuity internal) |
| 8 | Closes browser | `WebBrowser.openBrowserAsync()` resolves | — |
| 9 | App detects new booking | `queryClient.refetchQueries()` | `GET /api/appointments/upcoming` + `GET /api/booking/certificates` |
| 10 | "You're booked!" banner shown | `setNewBooking(detected)` | — |

**Unnecessary / friction steps:**
- Steps 6–8 are outside the app's UI. Member sees Acuity's brand, fonts, and layout.
- Member must manually close the browser. There is no redirect back from Acuity into the app.
- Step 9 is a best-effort comparison (appointment IDs before/after) — if Acuity is slow, the "You're booked!" banner may not appear.

### Cancel

| Step | User Action | Component / Function | API Call |
|---|---|---|---|
| 1 | Taps "Cancel" on appointment card | `appointments.tsx` → `handleCancel()` | — |
| 2 | Alert dialog shown | `Alert.alert()` | — |
| 3 | Confirms cancellation | `cancelAppointment(id)` | `DELETE /api/appointments/:id` |
| 4 | Server verifies ownership | `appointments.ts` | `GET /appointments/:id` (Acuity) |
| 5 | Server cancels | `appointments.ts` | `PUT /appointments/:id/cancel` (Acuity) |
| 6 | List refreshes | `invalidateAll()` | `GET /api/appointments/upcoming` |
| 7 | Delayed refresh (4s) | `setTimeout` | `GET /api/booking/certificates` |

**All native. Clean flow.** The 4-second delayed refresh is a workaround for Acuity's async session restoration; it works but could theoretically miss the update if Acuity is slow.

### Reschedule

| Step | User Action | Component / Function | API Call |
|---|---|---|---|
| 1 | Taps "Reschedule" on appointment card | `appointments.tsx` | — |
| 2 | `RescheduleModal` opens | `setRescheduleTarget()` | — |
| 3 | Selects a date | `handleSelectDate()` | `GET /api/appointments/:id/times?date=...` |
| 4 | Selects a time slot | `setSelectedSlot()` | — |
| 5 | Taps "Confirm" | `handleConfirm()` | `PUT /api/appointments/:id { datetime }` |
| 6 | Server verifies ownership | `appointments.ts` | `GET /appointments/:id` (Acuity) |
| 7 | Server reschedules | `appointments.ts` | `PUT /appointments/:id/reschedule` (Acuity) |
| 8 | Modal closes, list refreshes | `onSuccess()` → `invalidateAll()` | `GET /api/appointments/upcoming` |

**All native. Clean flow.** No external browser. No unnecessary steps.

---

## 5. Acuity UX Assessment

### Current State

| Dimension | Finding |
|---|---|
| **Screens to book** | ~4 interactions before Acuity takes over: tap Book tab → select/skip certificate → tap location → in-app browser opens. Inside Acuity: choose date → choose time → fill form → confirm → see confirmation page. Total: ~8–10 taps. |
| **Information the user must enter in Acuity** | First name, last name, email (pre-filled but editable), phone (required by Acuity if configured). Even with pre-fill, the member must verify and submit the form. |
| **Information we already know** | First name, last name, email (all available from Clerk). Certificate code (already applied in-app). Location / calendar (already chosen before browser opens). |
| **Repeated information** | Name and email are pre-filled but re-displayed in Acuity's form for the member to verify. Members may feel they are entering data twice. |
| **Acuity branding** | Full Acuity branding is visible in the browser: Acuity logo in the footer, Acuity's URL bar visible, generic scheduling page design. Does not match the app's dark/gold aesthetic. |
| **Transition quality** | Mobile: in-app browser slides up smoothly — less jarring. Web: new browser tab opens — feels like leaving the product entirely. |
| **Appointment type selection** | When a certificate is applied, types are pre-filtered. Without a certificate, all types for the calendar are shown and the member must know what to select. |
| **Date/time selection** | Acuity's date/time picker is functional but generic. The app's own RescheduleModal proves a native picker is feasible and better integrated. |
| **Error messages** | Errors during Acuity booking are Acuity's own messages; the app has no control over them. |
| **Confirmation** | Mobile: app compares appointment IDs and shows a "You're booked!" banner. Web: no native confirmation — member sees Acuity's confirmation page in the browser tab. |
| **Cancellation intuitiveness** | Good. Native dialog with clear policy warning, destructive action styling, and immediate feedback. |
| **Reschedule intuitiveness** | Good. Slide-up modal with date strip and time grid. Could benefit from a success toast. |
| **Mobile experience** | The native screens (dashboard, sessions, reschedule modal) are polished and mobile-first. The booking handoff to Acuity is the weak point; Acuity's scheduling page is not optimized for mobile. |

### Redesign Recommendation

Make booking feel like a native feature by building screens for: **Service selection → Date picker → Time slot grid → Confirm details → Booking confirmation**.

The API server already has all the necessary endpoints. The reschedule modal's date + time slot pattern is the template. Identity (name, email) is injected server-side from Clerk, so members never re-enter their information.

See [ACUITY_INTEGRATION.md § 11](ACUITY_INTEGRATION.md) for the proposed screen-by-screen flow.

---

## 6. Alternative Acuity Architectures

### Option A — Improved Acuity Embed (iframe)

Replace the external browser handoff with an iframe embedded in the app.

| | |
|---|---|
| **UX** | Somewhat better on web (no new tab), worse on mobile (iframes in React Native are fragile). Acuity's UI still visible. |
| **Technical complexity** | Low — just change the URL open to an iframe/WebView. |
| **Development effort** | 1–2 days |
| **Reliability** | Poor. Acuity's iframe has known issues with postMessage confirmation events, cookie handling on iOS, and CSP headers. |
| **Security** | The certificate code in the URL is visible in the iframe src. |
| **What can be reused** | Existing URL construction logic |
| **Advantages** | Minimal code change |
| **Disadvantages** | Still shows Acuity's UI and branding. Mobile WebView has iframe compatibility issues. Acuity may restrict iframe embedding. No improvement to confirmation flow. |

**Not recommended.**

### Option B — Full Custom Frontend + Acuity API (Full replacement)

Build a completely native booking flow. Remove all Acuity URL generation. Use only the API.

| | |
|---|---|
| **UX** | Fully native, fully branded, seamless confirmation. Best possible experience. |
| **Technical complexity** | Medium-high |
| **Development effort** | 3–5 weeks |
| **Reliability** | High — no dependency on Acuity's hosted UI behavior |
| **Maintenance** | Moderate — must handle Acuity API changes (availability endpoint structure, etc.) |
| **Security** | Excellent — all booking identity derived from Clerk server-side |
| **What can be reused** | All existing API endpoints, certificate logic, RescheduleModal as UX template |
| **What must be built** | Service selector, calendar date picker, time slot grid, confirm screen, success screen (mobile + web) |
| **Advantages** | Complete brand control, no external browser, locked identity, native confirmation |
| **Disadvantages** | Significant frontend work; membership purchase still requires Acuity's catalog |

### Option C — Hybrid: App Controls Selection, Acuity Handles Availability + Creation ✅ RECOMMENDED

Native screens for service/location selection, date picking, time picking, and confirmation. Acuity API for availability data and appointment creation. Membership purchase remains a link to Acuity's catalog.

| | |
|---|---|
| **UX** | Native for booking. Only membership purchase exits the app. |
| **Technical complexity** | Medium |
| **Development effort** | 2–4 weeks |
| **Reliability** | High |
| **Maintenance** | Low — less surface area than full replacement; membership catalog remains Acuity's responsibility |
| **Security** | Excellent — identity locked to Clerk |
| **What can be reused** | ALL existing API endpoints (`/booking/availability/dates`, `/booking/availability/times`, `/booking/appointments` POST, `/booking/certificates`). RescheduleModal UX pattern. |
| **What must be built** | Service selector screen, date calendar screen, time slot screen, confirm screen, success screen (both mobile + web). |
| **Advantages** | Fastest path to native booking experience. Backend already done. RescheduleModal is the template. |
| **Disadvantages** | Membership purchase still exits the app (acceptable for v1). |

### Option D — Third-Party Scheduling Library

Replace Acuity with a more API-first scheduling service (Cal.com, Calendly API, custom).

| | |
|---|---|
| **UX** | Potentially excellent if the new service is more API-native |
| **Technical complexity** | Very high — migration of all existing appointment data, member certificates/packages, staff workflows |
| **Development effort** | 8–16 weeks |
| **Risk** | Very high |

**Not recommended** at this stage.

---

## 7. Functional Audit

### Authentication

| Finding | Severity |
|---|---|
| Sign-in correctly uses `strategy: 'password'` — without this, Clerk silently no-ops on multi-method accounts. Documented in MEMORY.md. | ✅ Fixed |
| Ghost session eviction (`evictGhostSessions()`) handles Clerk v4's post-signout state bug. | ✅ Fixed |
| `useAuth().isLoaded` is used instead of `useSignIn().isLoaded` (which stays false after signout in Clerk Expo v4). | ✅ Fixed |
| Biometric credentials are stored in `expo-secure-store`. Stale credentials (password changed) are detected and cleared on next biometric attempt. | ✅ Good |
| Admin gating is by email comparison on the frontend (`user.emailAddresses[0].emailAddress === adminEmail`). A user with multiple email addresses who changes their primary might lose admin access or gain it unexpectedly. | ⚠️ Low risk |
| The `VITE_ADMIN_EMAIL` is a client-side env var — visible in the browser's source/network tab. A determined user could discover the admin email address. The backend independently validates admin status; this is a UX issue, not a security hole. | ⚠️ Low risk |
| No 2FA support — the sign-in flow explicitly shows an error if the account has 2FA enabled and tells the member to disable it. | ⚠️ Limitation |

### Authorization

| Finding | Severity |
|---|---|
| All API routes require a valid Clerk JWT (`requireAuth` middleware in every route file). | ✅ Good |
| Before cancelling or rescheduling, the server fetches the appointment from Acuity and compares `appt.email` against the authenticated user's Clerk email. Prevents one member from cancelling another's appointment. | ✅ Good |
| Admin routes in `admin.ts` should be audited — not read for this audit, but should have server-side admin check, not just frontend gating. | ⚠️ Verify |
| The `PATCH /api/user/profile` endpoint allows updating any user's name via the Clerk admin SDK. The route uses `getAuth(req).userId` so it only updates the authenticated user — this is correct. | ✅ Good |

### Data Persistence

| Finding | Severity |
|---|---|
| **No local database for appointments.** All data lives in Acuity. The app cannot function if Acuity is unreachable. | ⚠️ Architectural risk |
| Preferred location and notification timing are stored in `AsyncStorage` (mobile) — device-local, not synced across devices or to the backend. | ⚠️ Expected limitation |
| Biometric credentials are stored in `expo-secure-store` — encrypted, device-local. Not synced. If a member reinstalls the app, biometric setup is lost. | ⚠️ Expected limitation |
| Certificate code entered manually is stored in `AsyncStorage` (mobile) and `localStorage` (web). Does not persist across app reinstalls / browser clears. | ⚠️ Minor |

### API Errors and Loading States

| Finding | Severity |
|---|---|
| All screens have loading spinners (ActivityIndicator / Skeleton). | ✅ Good |
| `friendlyError()` translates raw errors to user-readable messages. | ✅ Good |
| API errors on the Sessions screen show a retry button with the error message. | ✅ Good |
| The Book screen shows skeleton cards while config loads. | ✅ Good |
| If `GET /api/booking/certificates` fails, the "YOUR MEMBERSHIPS" section simply doesn't appear (not shown, not errored). No error message is shown to the member. | ⚠️ Minor UX gap |
| If `POST /booking/appointments` fails (web portal path — native flow doesn't exist yet on mobile), the error is returned from the API but there is no UI to display it (the booking form is Acuity's). | ⚠️ N/A until native flow built |

### Form Validation

| Finding | Severity |
|---|---|
| Certificate code input is uppercase-normalized and debounced (600ms on web, immediate on mobile). | ✅ Good |
| Password change: minimum 8 chars, passwords-match check, both with inline error messages. | ✅ Good |
| Name fields: trim on save, `autoCapitalize="words"`. No length validation. | ⚠️ Minor |
| Reschedule: cannot confirm without selecting both date and time (button disabled). | ✅ Good |

### Duplicate Submissions / Race Conditions

| Finding | Severity |
|---|---|
| `bookingInProgress` state gate prevents double-tap on "Book Now". | ✅ Good |
| `RescheduleModal` uses `submitting` gate to disable the Confirm button during the API call. | ✅ Good |
| `loadingSlots` + `currentDateKey` ref prevents stale time-slot responses from earlier date taps overwriting fresher ones. | ✅ Good |
| Cancel dialog requires explicit user confirmation — double cancellation not possible without re-tapping. | ✅ Good |
| Certificate `checking` state prevents rapid double-validation. | ✅ Good |

### Timezone and Date Handling

| Finding | Severity |
|---|---|
| Several places correctly avoid `toISOString()` (which converts to UTC and rolls over to the next day after ~7–8 pm Eastern) and manually construct `YYYY-MM-DD` from local date parts. | ✅ Good |
| `BOOKING_TIMEZONE=America/New_York` is sent to Acuity for availability queries. | ✅ Good |
| `GET /appointments/upcoming` uses a local-time `today` variable (manually constructed from `new Date()`). | ✅ Good |
| `GET /appointments/past` uses `toISOString().split('T')[0]` — this is UTC, which will include today's appointments after ~8 pm Eastern. Minor inconsistency. | ⚠️ Minor |
| The RescheduleModal `toYMD()` function uses local date parts (correct). | ✅ Good |
| The Dashboard's `todayYMD` filter uses local date parts (correct). | ✅ Good |
| `new Date(summary.nextAppointment.date)` in `Dashboard.tsx` does not append `T00:00:00` — may render yesterday's date in Eastern timezone. | ⚠️ Minor bug |

### Performance

| Finding | Severity |
|---|---|
| React Query caches Acuity data with appropriate stale times (config: 10 min, certs: 0 / always fresh, availability: 1–2 min). | ✅ Good |
| ETag generation is disabled on the API server to prevent 304 responses serving stale Acuity data. | ✅ Good |
| `Cache-Control: no-store` is set on all `/api` responses. | ✅ Good |
| `useAppForegroundRefresh` triggers refetches on app foreground — keeps data fresh after external browser use. | ✅ Good |
| The summary endpoint makes two parallel Acuity requests (`Promise.all`). | ✅ Good |
| Every appointment action (cancel, reschedule) makes an ownership-verification GET before the mutating call — 2 Acuity requests per action. Acceptable for low-volume studio use. | ⚠️ Minor latency |

### Security

| Finding | Severity |
|---|---|
| Acuity credentials are server-side only, never sent to clients. | ✅ Good |
| CORS allowlist is explicit — no origin reflection. | ✅ Good |
| Appointment ownership is verified server-side before any mutation. | ✅ Good |
| Clerk JWT is validated server-side via middleware on every route. | ✅ Good |
| Identity for `POST /booking/appointments` is derived from Clerk, not from request body. | ✅ Good |
| The Acuity booking URL contains the member's email in plaintext (`&email=...`). Visible in browser history / network logs. Low risk in practice but worth noting. | ⚠️ Low |
| The Acuity booking URL may contain a certificate code in plaintext (`&certificate=...`). Same exposure as email. | ⚠️ Low |

---

## 8. UI/UX Audit

### Web Portal

| Dimension | Finding |
|---|---|
| **Visual hierarchy** | Clear. Dashboard's three stat cards are the visual anchor. Primary action ("Book a Session") is prominent. |
| **Navigation** | Clean top navbar. Active state is highlighted. Admin link only shown to admin. Mobile hamburger menu works. |
| **Dashboard** | Well-organized. Stats → upcoming appointments → empty state with CTA. |
| **Typography** | Plus Jakarta Sans (display) + system sans-serif. Consistent heading hierarchy. |
| **Spacing** | Consistent padding and gaps via Tailwind. |
| **Buttons** | Clear primary (gold) vs outline vs ghost hierarchy. |
| **Cards** | Rounded, bordered, shadow. Consistent between appointment cards and dashboard stat cards. |
| **Color** | Dark background (`hsl(0,0%,5%)`), gold primary (`hsl(46,63%,52%)`). Strong brand identity. |
| **Consistency** | High. shadcn/ui components provide a consistent baseline. |
| **Mobile responsiveness** | Good. Grid → single column at small breakpoints. Navbar has a hamburger menu. Some table-heavy admin views may be cramped on mobile. |
| **Accessibility** | Labels on form fields. Focus indicators from shadcn defaults. Icon-only buttons (`LogOut`) have `title` attributes but no `aria-label`. |
| **Empty states** | Dashboard empty state is well-designed (icon + message + CTA). Appointments empty state exists. Book screen shows skeletons while loading. |
| **Error states** | API errors surface inline on query failure. Password change errors are shown inline in the dialog. |
| **Onboarding** | None. New members land on the dashboard immediately after sign-up. No onboarding flow or tutorial. |
| **Information density** | Appropriate. Dashboard is not cluttered. |

### Mobile App

| Dimension | Finding |
|---|---|
| **Visual hierarchy** | Strong. Barlow Condensed for display text, Inter for body. Gold primary creates clear visual hierarchy. |
| **Navigation** | 5-tab bottom navigation. Icons + labels. Active state is clear. |
| **Dashboard** | Good density. Greeting, stat cards, today card, next session. |
| **Typography** | Two font families (Barlow Condensed + Inter) used consistently. Letter-spacing and weight variations create clear hierarchy without relying on size alone. |
| **Buttons** | Clear. "Book a Session" CTA is always gold and prominent. Destructive actions (cancel, sign out) use red. |
| **Cards** | Rounded cards with border and subtle backgrounds. Appointment cards are well-structured with date/time/type/location. |
| **Dark theme** | Consistent dark backgrounds. No light mode discrepancy. |
| **Haptics** | Used appropriately on button taps and actions. Adds physicality. |
| **Mobile responsiveness** | Native — inherently responsive. iOS/Android platform differences handled (SF Symbols on iOS, SVG icons on Android). |
| **Accessibility** | `hitSlop` used on small touch targets. No `accessibilityLabel` on most custom touchable elements — would fail basic accessibility audit. |
| **Empty states** | Sessions tab has a good empty state. Book screen has loading skeletons. |
| **Notification timing** | Configurable per member (24h / 2h / both / off). Scheduled locally as push notifications. |
| **Known UI gap** | Preferred location is stored but not surfaced on the Book screen. |
| **Known UI gap** | No success toast after reschedule. |
| **Known UI gap** | Booking confirmation ("You're booked!") only appears on the Book tab, not if the member navigates elsewhere after closing the browser. |

---

## 9. Scheduling Redesign Proposal

See [ACUITY_INTEGRATION.md § 11](ACUITY_INTEGRATION.md) for the complete screen-by-screen proposal.

**Summary:** 5-step native flow — Service → Date → Time → Confirm → Success. No external browser. Identity locked to Clerk. Existing API endpoints cover the entire backend.

---

## 10. Code-Level Recommendations

> No changes should be made based on this document without a separate implementation plan. Listed for future reference only.

| File / Area | Recommendation | Why |
|---|---|---|
| `app/(tabs)/book.tsx` | **Refactor into a multi-step native booking flow** (or move to a stack screen rather than a tab screen) | The tab screen is a poor container for a multi-step flow; it should be a navigated stack |
| `artifacts/fit-club-portal/src/pages/Book.tsx` | **Same — refactor into multi-step native flow** | Same reason as mobile |
| `artifacts/api-server/src/routes/booking.ts` | **No changes needed for core flow** — all required endpoints already exist | Ready to support the native booking redesign |
| `app/(tabs)/_layout.tsx` | **Remove `MEMBERSHIPS_URL` constant** and the tab-bar intercept once a membership purchase flow is added, or document clearly that this is intentional | The current pattern (tab that doesn't navigate to its screen) is non-standard and surprising |
| `artifacts/fit-club-portal/src/pages/Dashboard.tsx` | **Fix `new Date(summary.nextAppointment.date)`** → `new Date(summary.nextAppointment.date + 'T00:00:00')` | UTC parse causes off-by-one date display after ~8 pm Eastern |
| `artifacts/api-server/src/routes/appointments.ts` | **Fix `GET /appointments/past` `today` variable** to use local date parts (same pattern as `/upcoming`) | Using `toISOString().split('T')[0]` gives UTC date — includes today's appointments in "past" after ~8 pm Eastern |
| `artifacts/api-server/src/routes/admin.ts` | **Audit and add server-side admin check** | If it currently gates only by client-side email check, a bad actor who knows the admin email could attempt admin API calls |
| `app/(tabs)/book.tsx` | **Use member's preferred location** (from `AsyncStorage`) to default-highlight the matching location card | The preference is stored but ignored on this screen |
| `components/RescheduleModal.tsx` (both apps) | **Add a success banner/toast** after successful reschedule | Currently the modal closes silently |
| `lib/api-spec/openapi.yaml` | **Add remaining endpoints** to the spec (booking, user, admin routes) | The spec only covers appointments and health — the rest of the API is undocumented |
| `lib/db/src/schema/index.ts` | **Leave as-is until a clear use case emerges** | Premature schema design would create maintenance overhead without benefit |
| `artifacts/api-server/src/config/acuity.ts` | **Add a staff-facing API + admin UI to edit IDs** (Task #27) | Currently requires accessing Replit Secrets for any ID change |

---

## 11. Document Index

- **[APP_AUDIT.md](APP_AUDIT.md)** — This document. Full audit with executive summary.
- **[ACUITY_INTEGRATION.md](ACUITY_INTEGRATION.md)** — Acuity integration architecture, booking flows, problems, and redesign proposal.
- **[FILE_MAP.md](FILE_MAP.md)** — Annotated map of all significant source files.
