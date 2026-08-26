---
name: Expo pnpm range normalization
description: A pnpm save-prefix quirk encountered when aligning Expo packages with the SDK-aware installer.
---

When Expo’s SDK-aware installer invokes pnpm with a tilde-compatible package target, pnpm can persist the selected dependency using its default caret save prefix. The resolved package version and Expo compatibility check can still be correct, but the manifest range no longer matches the intended tilde convention.

**Why:** Keeping Expo package ranges aligned with the project’s tilde convention prevents the manifest from silently broadening the allowed minor-version range after a successful SDK-aware install.

**How to apply:** After using `expo install` with pnpm, inspect both `package.json` and the lockfile importer. If pnpm changed only the approved packages from `~` to `^`, normalize those specifiers without changing the resolved versions or any other dependency.