---
name: Expo Clerk key precedence
description: Which configured Clerk publishable key controls the Expo development workflow.
---

The mobile development command explicitly assigns `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from `CLERK_PUBLISHABLE_KEY` before starting Metro. A separately stored Expo-prefixed secret can therefore be stale or belong to another Clerk instance without controlling the running preview.

**Why:** Multiple publishable-key secrets may coexist after setup changes, and comparing the stored names alone can make the wrong Clerk user store appear to be active.

**How to apply:** Inspect the development command and running workflow environment first. Treat the non-Expo `CLERK_PUBLISHABLE_KEY` as the authoritative mobile development source unless the command changes; never manually rotate managed secrets to resolve this ambiguity.