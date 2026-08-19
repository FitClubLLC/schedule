---
name: Android Book tab blur reset
description: Android Expo Go behavior when resetting Fit Club Mobile Book's nested stack while blurring the bottom tab.
---

Do not configure `popToTopOnBlur` on the Mobile Book tab. Keep the navigator's default preserved nested-stack behavior, and retain the confirmation-route guard as the protection against stale or malformed booking success routes.

**Why:** On a real Android Expo Go device, leaving Book and returning after the blur-time nested-stack reset could leave the entry screen visibly pending even though its authenticated booking reads completed successfully on the API.

**How to apply:** If Book must later return to a particular route after tab navigation, verify an explicit, focus-safe route action on Android rather than adding a blur-time navigator reset. Do not weaken the confirmation payload validation to compensate.