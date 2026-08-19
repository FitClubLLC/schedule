---
name: Portal React type alignment
description: How the Portal avoids duplicate React type identities in the pnpm workspace.
---

Portal’s development-only React type packages must stay in the React 19.1 family used by the Expo mobile app. TypeScript follows pnpm real paths for Portal libraries such as `react-day-picker` and `lucide-react`, which otherwise resolve the virtual-store React 19.1 types while Portal resolves newer local React types.

**Why:** React callback-ref types carry version-specific identity. Mixing the 19.1 and 19.2 declarations creates incompatible `Ref` values at Portal component boundaries. The compiler `preserveSymlinks` workaround is unsafe: it produces widespread unrelated Radix and shared-library errors.

**How to apply:** Keep the Portal’s direct development-only React type ranges aligned with Mobile’s Expo-compatible 19.1 ranges. Do not change the shared catalog, runtime React versions, or add a root override solely to address this Portal typing issue.