/**
 * useDeepLink
 *
 * Handles inbound deep links that target the Book tab, both on cold start and
 * while the app is already running in the foreground.
 *
 * Supported URL formats (scheme registered in app.json → expo.scheme: "fitclub15"):
 *   fitclub15://book?certificate=8B86C782
 *   fitclub15:///book?certificate=8B86C782
 *
 * Expo Router's NavigationContainer already handles cold-start and
 * background→foreground transitions automatically via its internal linking
 * config.  This hook adds a Linking event listener as an explicit layer so
 * that foreground links also navigate to the correct tab and pass the param.
 */

import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';

/** Extract the `certificate` query param from a deep-link URL, or null. */
function extractCertificate(url: string): string | null {
  try {
    // URL constructor handles both fitclub15://book?... and fitclub15:///book?...
    const parsed = new URL(url);
    return parsed.searchParams.get('certificate');
  } catch {
    // Fallback regex for edge-case URL shapes
    const match = url.match(/[?&]certificate=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/** Return true if the URL is a valid fitclub15:// deep link targeting the book route. */
function isBookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Reject anything that isn't our registered app scheme.
    if (parsed.protocol !== 'fitclub15:') return false;
    // pathname is "/book" or "" with host "book"
    return parsed.pathname.replace(/^\/+/, '') === 'book' || parsed.host === 'book';
  } catch {
    // Malformed URL — reject rather than fall back to a broad string match.
    return false;
  }
}

export function useDeepLink() {
  const router = useRouter();

  useEffect(() => {
    function handleUrl(url: string) {
      if (!isBookUrl(url)) return;

      const certificate = extractCertificate(url);
      if (certificate) {
        router.push({ pathname: '/(tabs)/book', params: { certificate } });
      } else {
        router.push('/(tabs)/book');
      }
    }

    // Cold-start: app launched via deep link (Expo Router usually handles this,
    // but we cover it here as a safety net for cases where auth redirects fire
    // before the router processes the initial URL).
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Foreground: app already open and a link arrives.
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => subscription.remove();
    // router reference is stable across renders; no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
