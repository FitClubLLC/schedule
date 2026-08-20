---
name: Sentry CLI with pnpm
description: Why the Mobile app declares Sentry CLI directly despite React Native Sentry already depending on it
---

Keep the exact Sentry CLI version required by the installed `@sentry/react-native` package as a direct Mobile production dependency.

**Why:** The generated iOS “Upload Debug Symbols to Sentry” phase resolves `@sentry/cli/package.json` from the app root. pnpm may keep the CLI only beneath Sentry’s transitive package tree, where this root-level lookup cannot find it.

**How to apply:** When updating React Native Sentry, align the direct CLI version with the version declared by that Sentry package. Confirm a root-level Node `require.resolve('@sentry/cli/package.json')` succeeds after regenerating iOS files. Do not disable Sentry merely to bypass the build phase.