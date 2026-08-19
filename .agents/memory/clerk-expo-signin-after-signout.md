---
name: Clerk expo sign-in after sign-out
description: Why signIn.create() silently no-ops after sign-out in @clerk/expo v4, and how to fix it.
---

## Rule

With the installed `@clerk/expo` v4 Future API, use `signIn.password()` followed by `signIn.finalize()` for password authentication, and use the matching Future reset-password methods. Use `signUp.password()` to submit credentials and required first/last names together, then finalize only after email verification succeeds.

Before starting a new password attempt after sign-out, clear a lingering active session and refresh the Clerk client resource. Keep that recovery bridge narrowly scoped: the required client refresh and active-session inspection are not exposed in the public TypeScript types, but the actual sign-in and sign-up operations must remain on typed hook resources.

**Why:** A completed in-memory Clerk sign-in resource can survive sign-out and make the next attempt silently return no usable result. Future API factor methods plus `finalize()` create and activate the session through the SDK-supported path, while the client refresh obtains server-authoritative state first.

**How to apply:** Gate Expo screens with `useAuth().isLoaded`, never `ClerkLoaded` or a sign-in-resource truthiness check. Do not fall back to a stale `clerk.client.signIn` resource. Surface every Future-method error before progressing UI, and retain the secure token cache and shared-query cleanup on sign-out.
