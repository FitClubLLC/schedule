---
name: Expo vector-icons Android font family casing
description: @expo/vector-icons font family names are lowercase; Android matches strictly — registering with wrong case silently breaks icons.
---

## Rule
When manually loading `@expo/vector-icons` fonts via `expo-font`'s `useFonts`, the key in the font map must exactly match the internal font family string used by `createIconSet`, which is **lowercase** for Feather (and likely other sets).

```ts
// WRONG — capital F breaks on Android, works on iOS (case-insensitive)
useFonts({ Feather: require('@expo/vector-icons/.../Feather.ttf') })

// CORRECT — matches createIconSet(glyphMap, 'feather', font)
useFonts({ feather: require('@expo/vector-icons/.../Feather.ttf') })
```

**Why:** Android's font matching is case-sensitive. A wrong-cased family name silently falls back to the system default font, rendering icon glyphs as boxes. iOS is case-insensitive so the bug only surfaces on Android.

**How to apply:** Before registering any icon font, grep the icon set source for `createIconSet(` to find the exact fontFamily string passed as the second argument.

## Additional context
- `@expo/vector-icons` v15 does NOT expose `.font` as a static property — `Feather.font` is `undefined`. Must `require()` the `.ttf` directly:
  `require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf')`
- In Expo Go, icon fonts are pre-bundled, but explicit loading via `useFonts` is still needed to guarantee the correct family name is registered before render.
