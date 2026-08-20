---
name: Android Book tab blur reset
description: Android Expo Go behavior when resetting Fit Club Mobile Book's nested stack while blurring the bottom tab.
---

Do not configure `popToTopOnBlur` on the Mobile Book tab. Also prevent a reselect of the already-focused Book tab when its nested stack is above the root, because React Navigation's native stack otherwise dispatches its own bulk `popToTop`.

**Why:** On a real Android Expo Go device, both blur-time and focused-tab bulk stack resets could leave the Book root visibly pending even though its authenticated booking reads completed successfully on the API. Step-by-step back navigation remained stable.

**How to apply:** Keep normal tab entry from other tabs and root-level tab behavior. When Book is focused on a nested booking screen, make a Book-tab reselect a no-op rather than resetting the stack. Use the existing back arrows for step-by-step return; retain the confirmation-route guard.