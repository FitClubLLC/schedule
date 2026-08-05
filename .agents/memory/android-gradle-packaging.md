---
name: Android Gradle MergeJavaResource fix
description: How to fix duplicate META-INF resource conflicts in EAS Android builds for this project
---

# Android Gradle MergeJavaResource Packaging Fix

## The rule
Any `MergeJavaResWorkAction` Gradle failure means two libraries ship the same file path inside the APK. Fix by adding the conflicting path to `pickFirst` in `expo-build-properties`.

**Why:** `okhttp3:logging-interceptor` and `org.jspecify:jspecify` both include `META-INF/versions/9/OSGI-INF/MANIFEST.MF`. Gradle errors instead of silently picking one.

**How to apply:** Already fixed in `artifacts/fit-club-mobile/app.json` via the `expo-build-properties` plugin. If a new library adds another conflict, add the path to the `pickFirst` array in the same plugin config.

## EAS log decoding
EAS build logs are brotli-compressed. To read them:
```js
const text = zlib.brotliDecompressSync(data).toString('utf8');
const lines = text.split('\n').map(l => JSON.parse(l));
// filter by phase: 'RUN_GRADLEW' and source: 'stderr' for Gradle errors
```

## Other Android build notes
- `icon.png` must be square (1024×1024). All project images were 1000×606 — fixed with ImageMagick padding to 1024×1024 with black background.
- EAS logs URL from GraphQL: `builds { byId(buildId: "...") { logFiles } }`
