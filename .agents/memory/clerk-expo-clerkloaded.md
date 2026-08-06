---
name: ClerkLoaded/ClerkLoading in Expo Go
description: ClerkLoaded and ClerkLoading from @clerk/expo are re-exports from @clerk/react (web). They hang indefinitely in Expo Go because the web Clerk context doesn't resolve the same way as the Expo one.
---

## Rule

Never use `<ClerkLoaded>` or `<ClerkLoading>` from `@clerk/expo` to gate an Expo app tree.
They are thin re-exports from `@clerk/react` (the web package) and do not reliably resolve in Expo Go.

**Why:** The `@clerk/expo` `ClerkProvider` wires Clerk into the React Native context, but `ClerkLoaded`/`ClerkLoading` check the `@clerk/react` web context. In Expo Go those hooks never see `loaded: true`, so `<ClerkLoaded>` never renders its children and `<ClerkLoading>` spins forever.

**How to apply:** Use `useAuth().isLoaded` inside a component that is already inside `<ClerkProvider>` to gate rendering:

```tsx
function RootLayoutNav() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#C8A96E" />
      </View>
    );
  }
  // ...rest of nav
}
```

`useAuth().isLoaded` is set by `@clerk/expo`'s own context and is the Expo-safe initialization flag.

## Also note

`useSignUp().isLoaded` can remain `false` even after `useAuth().isLoaded` is `true`. This happens when sign-up is disabled or restricted on the Clerk dev instance (e.g. dev key usage limits). It is a Clerk dashboard/key issue, not an app-code issue. Switching to production Clerk keys fixes it.
