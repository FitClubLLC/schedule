---
name: Mobile static build port
description: Avoid the fixed-port conflict between the Expo static build and Canvas preview service.
---

The Fit Club Mobile static Expo build requires exclusive access to port 8081. The Canvas component preview workflow can occupy that same port, which makes Expo halt in non-interactive mode while asking to use a different port.

**Why:** The static build script explicitly starts and downloads from Metro at port 8081; it cannot accept an alternate port in the non-interactive build flow.

**How to apply:** Before running the Mobile static build, temporarily stop the Canvas preview workflow if it owns port 8081, run the build, then immediately restart that workflow. Do not change either artifact's configured port solely for this validation.