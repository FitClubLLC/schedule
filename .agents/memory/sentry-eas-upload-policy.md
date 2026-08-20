---
name: Sentry EAS upload policy
description: Production archive behavior when Sentry source-map and debug-symbol uploads have no authentication token
---

Keep `SENTRY_DISABLE_AUTO_UPLOAD=true` in the Mobile EAS production profile unless the product deliberately adopts authenticated Sentry artifact uploads.

**Why:** The React Native Sentry iOS build scripts require authentication only to upload source maps and native debug files. With no approved build token, those uploads block the archive. The runtime SDK uses its DSN independently to report production errors.

**How to apply:** Preserve the Sentry Expo plugin and the runtime `Sentry.init` setup. If authenticated artifact uploads become a requirement, use an approved build secret rather than embedding a token in app configuration, and verify the upload policy before removing the production flag.