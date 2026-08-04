# Fit Club Portal

A client-facing membership portal for Fit Club. Members sign in with their email via Clerk Auth, view their upcoming and past appointments pulled live from Acuity Scheduling, and book new sessions with their name and email pre-filled in the Acuity embed.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/fit-club-portal run dev` — run the frontend (port 18678)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind v4, shadcn/ui, Wouter routing, TanStack Query
- Auth: Clerk (Replit-managed, cookie-based for web)
- API: Express 5, Zod validation
- Appointments: Acuity Scheduling REST API v1 (server-side, Basic auth)
- API codegen: Orval (from OpenAPI spec in lib/api-spec/openapi.yaml)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `artifacts/api-server/src/routes/appointments.ts` — Acuity proxy routes
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — Clerk proxy middleware
- `artifacts/fit-club-portal/src/` — React frontend

## Architecture decisions

- **Acuity calls are server-side only.** The API key never reaches the browser. Routes in `appointments.ts` authenticate via Clerk, look up the user's email from the Clerk Backend SDK (`clerkClient.users.getUser`), then call the Acuity API filtered by that email.
- **Booking uses an iframe embed.** The `/book` page renders the Acuity scheduling page in an iframe with `firstName`, `lastName`, and `email` query params pre-filled from `useUser()`.
- **Clerk proxy path is `/api/__clerk`.** The `clerkProxyMiddleware` is mounted before body parsers in `app.ts` since it streams raw bytes.
- **No database needed.** All appointment data lives in Acuity. The DB package is present but unused by this app.

## Environment Variables & Secrets

- `ACUITY_USER_ID` — Acuity account user ID (env var, shared)
- `ACUITY_API_KEY` — Acuity API key (secret)
- `ACUITY_CALENDAR_URL` — Public Acuity booking URL for iframe embed (env var, shared)
- `VITE_ACUITY_CALENDAR_URL` — Same URL exposed to frontend (env var, shared)
- `VITE_BUSINESS_NAME` — "Fit Club" (env var, shared)
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Replit Clerk integration

## Gotchas

- Re-run codegen after any change to `lib/api-spec/openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`
- Use `type: number` (not `type: integer`) in the OpenAPI spec — the workspace uses Zod v3 which doesn't have `zod.int()` as a standalone.
- `tailwindcss({ optimize: false })` in `vite.config.ts` is required — without it, Clerk's nested `@layer` CSS gets reordered in prod builds and the auth UI breaks.

## User preferences

_Populate as you build._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk setup and troubleshooting
