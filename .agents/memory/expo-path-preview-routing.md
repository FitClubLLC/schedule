---
name: Expo path preview routing
description: Development-only handling for Expo artifacts shown through a path-based preview.
---

When an Expo app is also shown through the workspace’s `/mobile/` path preview, Metro emits root-relative development bundle URLs that can be claimed by another artifact. Keep the direct Expo development origin unchanged and use a development-only proxy that prefixes preview asset requests while passing the matching Metro base URL.

**Why:** A path preview can successfully return Expo HTML while its JavaScript resolves outside that path and receives another artifact’s HTML instead.

**How to apply:** Keep production build and serve commands unchanged. Verify both that `/mobile/` renders after settling and that its emitted entry bundle is served as JavaScript under the `/mobile/` prefix; preserve direct Expo status/origin access.