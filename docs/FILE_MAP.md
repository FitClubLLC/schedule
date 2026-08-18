# Fit Club 15 — File Map

> Concise map of every meaningful source file and what it does.
> Generated from codebase inspection. Does not include `node_modules`, build artifacts, generated code, or config boilerplate.

---

## Monorepo Root

```
/
├── pnpm-workspace.yaml          # Workspace package resolution
├── package.json                 # Root scripts (build, lint, type-check)
├── replit.md                    # Project overview and agent preferences
├── LOCAL_DEV.md                 # Local development instructions
└── docs/                        # ← You are here
```

---

## `artifacts/api-server/` — Express API (Node.js / TypeScript)

The shared backend. Both the mobile app and web portal talk exclusively to this server. It proxies Acuity and Clerk — clients never call either service directly.

| File | What it does |
|---|---|
| `src/app.ts` | Express app factory. Disables ETags and sets `Cache-Control: no-store` on all `/api` routes so Acuity data is never stale-cached. Configures CORS, Clerk middleware, body parsers, and the Clerk proxy. |
| `src/index.ts` | Server entry point. Starts the HTTP server on `$PORT`. |
| `src/config/acuity.ts` | Single source of truth for all Acuity numeric IDs (owner ID, appointment type IDs, calendar IDs). Reads from env vars with hardcoded production defaults. |
| `src/routes/index.ts` | Mounts all sub-routers under `/api`. |
| `src/routes/appointments.ts` | **Appointment CRUD via Acuity API.** `GET /appointments/upcoming`, `GET /appointments/past`, `GET /appointments/summary`, `DELETE /appointments/:id` (cancel), `GET /appointments/:id/times` (available slots), `PUT /appointments/:id` (reschedule). All routes look up the user's email from Clerk before calling Acuity, and verify appointment ownership before cancel/reschedule. |
| `src/routes/booking.ts` | **Booking flow support.** `GET /booking/config` (Acuity IDs for URL construction), `GET /booking/locations`, `GET /booking/appointment-types`, `GET /booking/availability/dates`, `GET /booking/availability/times`, `GET /booking/certificates` (member packages), `GET /booking/certificates/check` (validate a code), `POST /booking/appointments` (create appointment via Acuity API). |
| `src/routes/user.ts` | `PATCH /user/profile` — updates first/last name via Clerk admin SDK, bypassing Clerk's user-editable restriction. |
| `src/routes/admin.ts` | Admin-only endpoints (member list, etc.). Gated by email match against `ADMIN_EMAIL` env var. |
| `src/routes/health.ts` | `GET /healthz` — returns `{ status: "ok" }`. |
| `src/middlewares/clerkProxyMiddleware.ts` | Proxies Clerk's frontend API through the app server so mobile/web clients don't need direct Clerk access (required for custom domains). |
| `src/lib/logger.ts` | Pino structured logger configuration. |
| `.env.example` | Documents all required environment variables with descriptions. |

---

## `artifacts/fit-club-mobile/` — Expo / React Native App

The iOS and Android member app. Built with Expo Router (file-based routing), Clerk v4 for auth, React Query for data fetching.

### App Screens (`app/`)

| File | What it does |
|---|---|
| `app/_layout.tsx` | **Root layout.** Initialises Sentry, fonts (Inter + Barlow Condensed), Clerk provider with SecureStore token cache, React Query, gesture handler, keyboard controller, safe area. Wires `AppState` to React Query's `focusManager` so data refetches on foreground return. Handles auth routing (signed in → tabs, signed out → sign-in) and notification tap routing. |
| `app/(auth)/_layout.tsx` | Auth group layout (stack navigator, no headers). |
| `app/(auth)/sign-in.tsx` | **Sign-in screen.** Email + password form, forgot password / reset flow (email code), biometric sign-in support. Contains workarounds for Clerk v4 ghost-session bug after sign-out. |
| `app/(auth)/sign-up.tsx` | **Sign-up screen.** New member registration with email verification. |
| `app/(tabs)/_layout.tsx` | **Tab bar.** Renders `NativeTabLayout` (iOS 26+ Liquid Glass) or `ClassicTabLayout` (all other platforms). The Memberships tab intercepts its own tap to open Acuity's catalog in the system browser — the memberships screen itself is a fallback. |
| `app/(tabs)/index.tsx` | **Home / Dashboard screen.** Greeting, session count stats, today's sessions card, next session card, "Book a Session" CTA. Refetches on foreground. Schedules local push notifications via `useSessionReminders`. |
| `app/(tabs)/appointments.tsx` | **Sessions screen.** Upcoming / past appointment tabs. Cancel (with 24h policy warning) and reschedule via `RescheduleModal`. Refetches on foreground. |
| `app/(tabs)/book.tsx` | **Book screen.** Fetches Acuity config and member certificates. Member selects/enters a membership code, taps a location card, app opens Acuity's scheduling page in an in-app browser (`expo-web-browser`). Detects new bookings on browser close. |
| `app/(tabs)/memberships.tsx` | **Memberships fallback screen.** Shown only if the tab-bar intercept fails. Single button opens Acuity's membership catalog in the system browser. |
| `app/(tabs)/profile.tsx` | **Profile screen.** Name editing (via backend admin API), preferred location picker (AsyncStorage), session reminder timing picker (AsyncStorage), biometric toggle, change password modal, sign out. |
| `app/+not-found.tsx` | 404 screen for unmatched routes. |

### Components (`components/`)

| File | What it does |
|---|---|
| `components/AppointmentCard.tsx` | Renders a single appointment with date, time, type, location, and optional Reschedule/Cancel action buttons. |
| `components/RescheduleModal.tsx` | Bottom-sheet modal for rescheduling. 14-day date picker + available time slots fetched from API. Calls `rescheduleAppointment` on confirm. |
| `components/SvgIcon.tsx` | Central SVG icon registry. Inline paths for ~30 icons used across the app. |
| `components/ErrorBoundary.tsx` | React error boundary — catches render errors and shows `ErrorFallback`. |
| `components/ErrorFallback.tsx` | Fallback UI shown when the error boundary catches. |
| `components/KeyboardAwareScrollViewCompat.tsx` | Cross-platform keyboard-avoiding scroll view wrapper. |

### Hooks (`hooks/`)

| File | What it does |
|---|---|
| `hooks/useAppointmentActions.ts` | API client for cancel, reschedule, and fetch-available-times. Attaches Bearer token from Clerk, invalidates React Query caches on mutation. |
| `hooks/useAppForegroundRefresh.ts` | Invalidates specified React Query keys whenever the app returns to the foreground. Used on every screen that shows Acuity data. |
| `hooks/useBiometrics.ts` | Biometric availability check, credential save/load/clear via `expo-local-authentication` + `expo-secure-store`. |
| `hooks/useBiometrics.web.ts` | Web stub — all biometric functions return false/null. |
| `hooks/useCertificate.ts` | Certificate code state machine (idle → checking → valid/invalid). Calls `/api/booking/certificates/check`. |
| `hooks/useColors.ts` | Returns the active color palette (dark/light) from `constants/colors.ts`. |
| `hooks/useDeepLink.ts` | Handles `fitclub15://book?certificate=<code>` deep links, navigating to the Book tab with the code pre-applied. |
| `hooks/useSessionReminders.ts` | Schedules local push notifications for upcoming appointments. Reads timing preference (24h / 2h / both / off) from AsyncStorage. |
| `hooks/useSessionReminders.web.ts` | Web stub — no-op. |

### Libraries (`lib/`)

| File | What it does |
|---|---|
| `lib/friendlyError.ts` | Maps raw API/network errors to user-readable strings (e.g. "Acuity is temporarily unavailable"). |
| `lib/notificationPrefs.ts` | Shared constants: `NOTIF_TIMING_KEY`, `PREF_LOCATION_KEY`, `NotifTiming` type. |
| `lib/queryClient.ts` | React Query client configuration (stale time, retry logic). |

### Other

| File | What it does |
|---|---|
| `constants/colors.ts` | Dark and light color palette tokens. |
| `app.json` | Expo app configuration (bundle ID, version, icons, splash, permissions). |

---

## `artifacts/fit-club-portal/` — Web Member Portal (React / Vite / TypeScript)

A web app for members who prefer a browser. Same features as mobile: dashboard, appointments, booking. Also has an admin-only Members page.

### App Shell (`src/`)

| File | What it does |
|---|---|
| `src/App.tsx` | Root component. Sets up Wouter router, Clerk provider (with branded appearance matching the app's dark/gold theme), React Query provider, protected routes, and auth redirects. |

### Pages (`src/pages/`)

| File | What it does |
|---|---|
| `pages/Home.tsx` | Public landing/marketing page for unauthenticated visitors. |
| `pages/Dashboard.tsx` | Member dashboard. Shows appointment counts (upcoming/past), next session card, upcoming appointment list, "Book a Session" and "Purchase a Membership" CTAs, and Change Password dialog. |
| `pages/Appointments.tsx` | Upcoming / past appointment list with cancel and reschedule actions (using `RescheduleModal`). |
| `pages/Book.tsx` | Booking page. Mirrors the mobile Book screen — location cards, membership code input, member packages. Clicking a location card opens Acuity's scheduling page in a new browser tab. |
| `pages/Admin.tsx` | Admin-only member management page (visible only to the email matching `VITE_ADMIN_EMAIL`). |

### Components (`src/components/`)

| File | What it does |
|---|---|
| `components/AppointmentCard.tsx` | Renders an appointment card with Reschedule/Cancel actions. |
| `components/layout/Shell.tsx` | Page shell: `Navbar` + `main` content area with max-width container. |
| `components/layout/Navbar.tsx` | Top navigation bar. Dashboard, Appointments, Book a Session links. Admin link visible only to admin email. User name display, sign out button, mobile hamburger menu. |
| `components/ui/*` | shadcn/ui component library (Button, Card, Dialog, Input, Label, Skeleton, etc.). |

### Hooks (`src/hooks/`)

| File | What it does |
|---|---|
| `hooks/useBookingApi.ts` | All React Query hooks for booking: `useAcuityConfig`, `useBookingLocations`, `useAppointmentTypes`, `useAvailableDates`, `useAvailableTimes`, `useCreateBooking`, `useMemberCertificates`, `useCertificateCheck`. |
| `hooks/useAppointmentActions.ts` | Cancel, reschedule, and fetch-available-times for the portal (uses session cookies, not Bearer tokens). |

### Libraries (`src/lib/`)

| File | What it does |
|---|---|
| `lib/locations.ts` | Defines the two studio locations (Potomac / Kentlands) with Acuity calendar IDs. Reads from `VITE_LOCATION_*` env vars. |
| `lib/queryClient.ts` | React Query client (portal-specific config). |
| `lib/utils.ts` | `cn()` Tailwind class merging utility. |

### Styling

| File | What it does |
|---|---|
| `src/index.css` | Tailwind base + CSS custom properties for the design system (dark theme, gold primary). |
| `tailwind.config.ts` | Tailwind configuration with custom font families and color tokens. |

---

## Shared Libraries (`lib/`)

| Package | What it does |
|---|---|
| `lib/api-spec/openapi.yaml` | OpenAPI 3.1 spec for the public API (appointments, health). Used to generate typed clients. |
| `lib/api-spec/orval.config.ts` | Orval codegen config — generates React Query hooks from the OpenAPI spec. |
| `lib/api-client-react/` | Generated + custom React Query hooks (`useGetUpcomingAppointments`, etc.). Includes a `setBaseUrl` / `setAuthTokenGetter` pattern so mobile and web can both use the same hooks with different auth strategies. |
| `lib/api-zod/` | Generated Zod schemas for API request/response validation. Used server-side to validate Acuity data before sending to clients. |
| `lib/db/` | Drizzle ORM setup with PostgreSQL. **Currently has no defined tables** — schema file exports nothing. The database infrastructure exists but is not actively used; all data lives in Acuity and Clerk. |
