---
name: Workout credit selection policy
description: Member-facing rule for deciding between native Workout for 1 booking and Acuity-hosted individual-session payment.
---

When one or more eligible Workout for 1 credits exist, require the member to explicitly choose one before allowing native booking. Do not offer a paid bypass while eligible credits remain. When no eligible Workout for 1 credit exists, use the established Acuity-hosted payment handoff.

**Why:** The product owner explicitly confirmed that available credits must be consumed through an intentional selection rather than bypassed by an individual-session payment.

**How to apply:** Determine eligibility from Acuity-returned appointment coverage, never package names. Make the unselected-credit state clearly explained and unavailable in the UI; preserve the existing Acuity and Square payment flow for the no-credit handoff.