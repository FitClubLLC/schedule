import React, { useEffect } from 'react';
import { Platform, Linking, AppState, ActivityIndicator, View, StyleSheet } from 'react-native';
import { focusManager } from '@tanstack/react-query';

// Wire React Query's focusManager to AppState so refetchOnWindowFocus
// (and staleTime:0) actually triggers when the user returns to the app
// from an external browser (e.g. after booking in Acuity).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => sub.remove();
});
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ClerkProvider, useAuth } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

/** True when running as a real device build (EAS / production). False in Expo Go. */
const IS_REAL_BUILD = Constants.appOwnership !== 'expo';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  useFonts as useBarlowFonts,
} from '@expo-google-fonts/barlow-condensed';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { useDeepLink } from '@/hooks/useDeepLink';

// Show notifications as banners even when the app is in the foreground.
// Only load expo-notifications in real builds — it throws in Expo Go (SDK 53+).
if (IS_REAL_BUILD && Platform.OS !== 'web') {
  import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }).catch(() => { /* expo-notifications unavailable in Expo Go — skip */ });
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Set API base URL — EXPO_PUBLIC_DOMAIN is injected by the dev script at runtime.
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);


// Clerk token cache using expo-secure-store for persistent sessions.
const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
  async clearToken(key: string) {
    return SecureStore.deleteItemAsync(key);
  },
};

/**
 * Watches auth state and redirects between (auth) and (tabs) groups.
 * Also registers the Clerk token getter so the API client can attach Bearer tokens.
 * Handles notification taps so members land on the Appointments tab.
 */
function RootLayoutNav() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Gate the whole nav tree until Clerk finishes initialising.
  // useAuth().isLoaded is the reliable Expo-safe flag — ClerkLoaded/ClerkLoading
  // are @clerk/react web re-exports that don't resolve correctly in Expo Go.
  if (!isLoaded) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#C8A96E" />
      </View>
    );
  }

  // Register Clerk JWT getter with the API client.
  useEffect(() => {
    setAuthTokenGetter(async () => getToken());
  }, [getToken]);

  // Handle deep links (e.g. fitclub15://book?certificate=8B86C782).
  useDeepLink();

  // When the user taps a session-reminder notification, open the Appointments tab.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let sub: { remove: () => void } | null = null;

    if (!IS_REAL_BUILD) return;
    import('expo-notifications').then((Notifications) => {
      // App already open — notification tapped while foregrounded or from background.
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        const url = data?.url as string | undefined;
        if (url) {
          Linking.openURL(url).catch(() => {
            router.push('/(tabs)/appointments');
          });
        }
      });

      // Cold-start: app killed, user taps notification.
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, unknown>;
        const url = data?.url as string | undefined;
        if (url) {
          Linking.openURL(url).catch(() => {
            router.push('/(tabs)/appointments');
          });
        }
      });
    }).catch(() => { /* expo-notifications unavailable in Expo Go — skip */ });

    return () => sub?.remove();
    // router is stable; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle auth state transitions.
  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    }
  }, [isSignedIn, isLoaded, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [interLoaded, interError] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [barlowLoaded, barlowError] = useBarlowFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });

  const fontsLoaded = interLoaded && barlowLoaded;
  const fontError = interError || barlowError;

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable');
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
