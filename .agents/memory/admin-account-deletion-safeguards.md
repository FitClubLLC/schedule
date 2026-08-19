---
name: Admin account deletion safeguards
description: Rules for Client Dashboard administrator authorization and protected account deletion.
---

Authorize Client Dashboard administration using the Clerk primary email address, normalized case-insensitively against configured administrator emails. Refuse any admin action when configuration is absent, and block self-deletion or deletion of a configured administrator before calling Clerk's delete API.

**Why:** The first stored Clerk email may be a secondary address, raw email comparisons are brittle, and deleting a protected administrator can permanently remove all administrative access.

**How to apply:** Resolve `primaryEmailAddressId` for both the acting user and a delete target. Treat missing/invalid administrator configuration as unavailable authorization; inspect the target and apply deletion guards before any user mutation.