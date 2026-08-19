---
name: Expo path preview routing
description: Development-only handling for Expo artifacts shown through a path-based preview.
---

When an Expo app is also shown through the workspace’s `/mobile/` path preview, Metro emits root-relative development bundle URLs that can be claimed by another artifact. Keep the direct Expo development origin unchanged and use a development-only proxy that prefixes preview asset requests while passing the matching Metro base URL.

When that proxy rewrites the upstream `Host` to localhost, it must not forward the browser's public Expo `Origin` header to Metro. Expo treats the request as cross-origin (`public Expo host` versus `localhost`) and rejects the JavaScript bundle before the app can start.

**Why:** A path preview can successfully return Expo HTML while its JavaScript resolves outside that path and receives another artifact’s HTML instead.

**How to apply:** Keep production build and serve commands unchanged. For the development proxy's localhost-bound Metro request, remove the forwarded `Origin` header alongside the host rewrite; the browser is still same-origin with the public proxy and does not need Metro CORS. Verify both that `/mobile/` renders after settling and that its emitted entry bundle is served as JavaScript under the `/mobile/` prefix; preserve direct Expo status/origin access.