# Local Development Setup

This project has three services. Run all three together for full functionality.

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Expo CLI (`pnpm exec expo`)
- An Acuity Scheduling account (API credentials)
- A Clerk account (dashboard.clerk.com)

---

## 1 — API Server (`artifacts/api-server`)

Copy the example file and fill in your values:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

Then start:

```bash
pnpm --filter @workspace/api-server run dev
```

The server listens on the port specified by `PORT` (default 3001).

---

## 2 — Web Portal (`artifacts/fit-club-portal`)

Copy the example file and fill in your values:

```bash
cp artifacts/fit-club-portal/.env.example artifacts/fit-club-portal/.env
```

Then start:

```bash
pnpm --filter @workspace/fit-club-portal run dev
```

> **Note**: `BASE_PATH` must be set to `/` for local development.  
> `PORT` can be any free port, e.g. `5173`.

---

## 3 — Mobile App (`artifacts/fit-club-mobile`)

Copy the example file and fill in your values:

```bash
cp artifacts/fit-club-mobile/.env.example artifacts/fit-club-mobile/.env
```

Then start with Expo Go (development):

```bash
cd artifacts/fit-club-mobile
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<your_clerk_publishable_key> \
EXPO_PUBLIC_DOMAIN=localhost:3001 \
pnpm exec expo start
```

Or put the variables in the `.env` file (see below) and run:

```bash
pnpm --filter @workspace/fit-club-mobile run dev
```

> **Note**: `EXPO_PUBLIC_DOMAIN` should point to wherever the API server is running.  
> For local dev: `localhost:3001` (no https prefix — the app prepends `https://` automatically — adjust the `_layout.tsx` `setBaseUrl` call for plain http locally if needed).

---

## Where to get each secret

| Variable | Where to find it |
|---|---|
| `CLERK_SECRET_KEY` | [dashboard.clerk.com](https://dashboard.clerk.com) → your app → **API Keys** → Secret key (`sk_test_...` or `sk_live_...`) |
| `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` / `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same page → Publishable key (`pk_test_...` or `pk_live_...`) |
| `ACUITY_USER_ID` | [acuityscheduling.com](https://acuityscheduling.com) → Account → **Integrations** → API credentials → User ID |
| `ACUITY_API_KEY` | Same page → API Key |
| `ACUITY_OWNER_ID` | Your Acuity account owner ID (visible in the URL when logged in, or in API credentials) |
| `ADMIN_EMAIL` | The email address of the staff/admin account |

---

## Quick-start (all three services)

```bash
# From the project root
pnpm install

# Terminal 1 — API
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Portal
pnpm --filter @workspace/fit-club-portal run dev

# Terminal 3 — Mobile
pnpm --filter @workspace/fit-club-mobile run dev
```
