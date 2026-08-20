---
name: Clerk iOS native autolinking
description: The safe boundary for disabling Clerk's optional iOS native module in the Fit Club mobile app
---

For this app, the custom JavaScript Clerk provider and auth screens do not require `@clerk/expo`'s native iOS module. An iOS-only Expo autolinking exclusion is the narrow fix for Clerk's React Native SPM installation path; Android native autolinking remains enabled.

**Why:** `@clerk/expo` can register ClerkKit and ClerkKitUI through React Native's SPM integration even when the app imports only JavaScript Clerk APIs. That path can fail during CocoaPods installation before the app compiles, while Clerk's runtime supports the native module being unavailable.

**How to apply:** Keep the exclusion platform-scoped to iOS. Do not use it if the app begins importing `@clerk/expo/native` or Clerk native UI components; re-evaluate native module requirements first. Verify iOS autolinking resolves zero `@clerk/expo` modules and Android still resolves the module.