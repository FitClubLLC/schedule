---
name: Clerk expo sign-in after sign-out
description: Why signIn.create() silently no-ops after sign-out in @clerk/expo v4, and how to fix it.
---

## The problem

In `@clerk/expo` v4, after `signOut()`, `clerk.client.signIn` retains its previous `status: 'complete'` state in memory. Calling `signIn.create()` on that stale resource returns an empty object (`{ status: undefined, createdSessionId: undefined }`) — no error thrown, no result, just silence.

Additionally, `signIn.create()` called without `strategy: 'password'` silently no-ops on accounts that have multiple auth strategies attached (e.g. Google OAuth + password reset), because Clerk can't determine which path to use.

## The fix (applied in sign-in.tsx)

1. **`strategy: 'password'` is required** on every `signIn.create()` call for password-based accounts. Without it, Clerk silently returns nothing on multi-strategy accounts.

2. **On mount, reload the Clerk client** via `(clerk as any).client?.fetch?.()`. This resets the `SignIn` resource's internal status from `'complete'` back to `null`, making subsequent `create()` calls work correctly.

3. **Block sign-in until cleanup confirms** — `isClerkReady` state starts `false`, is set `true` only after the mount-time cleanup resolves. `signInReady = isLoaded && !!hookSignIn && isClerkReady` gates the button and both sign-in handlers.

4. **Evict ghost sessions first** — if `clerk.client.activeSessions.length > 0` when the sign-in screen mounts, call `clerk.signOut()` before the fetch reload.

**Why:** `client.fetch()` calls `/v1/client` on Clerk's API which returns the server-authoritative client state. After `signOut()`, the server knows there are no active sessions and no pending sign-in, so the refreshed client gets a blank `signIn` resource.

## Other findings

- `useSignIn().isLoaded` never becomes `true` after sign-out in `@clerk/expo` ^4 — use `useAuth().isLoaded` as the gate instead.
- `queryClient.clear()` should be called immediately after `signOut()` to prevent stale React Query data bleeding into the next session. Requires `queryClient` to be a shared singleton (moved to `lib/queryClient.ts`).
- `hookSignIn` (from `useSignIn()`) should always be used for `.create()` calls — never the `clerk.client?.signIn` fallback, which is a stale reference during the re-init window.
- Do NOT gate the sign-in button on `!!hookSignIn`. In `@clerk/expo` ^4, `hookSignIn` stays `undefined` indefinitely after sign-out.
- Do NOT add extra state (like `isClerkReady`) that is referenced before its `useState` declaration in the component body. Babel transpiles `const` to `var`, so the variable is hoisted as `undefined`, making any derived value that uses it permanently falsy. All state declarations must come before any derived values.
- The correct pattern: `signInReady = isLoaded` (simple). Do the stale-client flush inside the submit handler via `refreshClerkClient()` (which races client.fetch() against a 2s timeout), not in a useEffect that can be cancelled.
