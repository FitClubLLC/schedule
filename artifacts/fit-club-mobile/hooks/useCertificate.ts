import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { isAuthoritativeCertificateInvalidStatus } from '@/lib/certificateValidation';

// Storage key is namespaced by Clerk userId so certificates don't leak
// between accounts on a shared device.
function storageKey(userId: string | null | undefined): string {
  return userId ? `@fitclub/certificate/${userId}` : '@fitclub/certificate';
}

export type CertStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'unavailable';

export interface CertInfo {
  productName: string;
  remainingValue: string;
  /**
   * When true the certificate applies to all appointment types at any location.
   * Mirrors the Acuity "appliesToAllProducts" field.
   */
  appliesToAllProducts: boolean;
  /**
   * Acuity appointment type IDs this certificate is valid for.
   * Mirrors the backend "productIDs" field returned by /api/booking/certificates/check.
   * Used by the booking UI to determine which services the member can book.
   */
  productIDs: string[];
}

export function useCertificate() {
  const { getToken, userId } = useAuth();
  const [code, setCodeState] = useState('');
  // Separate debounced value so we don't hit the API on every keystroke,
  // but still fire immediately when a code is applied via "Tap to Use".
  const [debouncedCode, setDebouncedCode] = useState('');
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // Load persisted code on mount — skip debounce so the banner appears instantly.
  useEffect(() => {
    AsyncStorage.getItem(storageKey(userId)).then((stored) => {
      if (stored) {
        setCodeState(stored);
        setDebouncedCode(stored);
      }
    });
  }, [userId]);

  // Debounce manual keystrokes; clear immediately when the field is cleared.
  useEffect(() => {
    if (!code.trim()) {
      setDebouncedCode('');
      return;
    }
    const timer = setTimeout(() => setDebouncedCode(code.trim()), 600);
    return () => clearTimeout(timer);
  }, [code]);

  // React Query owns the /check fetch. staleTime:0 + focusManager wired to
  // AppState means this re-fetches automatically on foreground return.
  const checkQuery = useQuery<CertInfo>({
    queryKey: ['cert-check', debouncedCode],
    enabled: !!debouncedCode,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `${baseUrl}/api/booking/certificates/check?certificate=${encodeURIComponent(debouncedCode)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const codeIsInvalid = isAuthoritativeCertificateInvalidStatus(res.status);
        // Only Acuity's 422 validation response proves the code itself cannot
        // be used. Preserve a saved code across network and server failures.
        if (codeIsInvalid) {
          await AsyncStorage.removeItem(storageKey(userId));
        }
        throw Object.assign(
          new Error(codeIsInvalid ? 'Invalid certificate' : 'Unable to validate certificate'),
          { codeIsInvalid },
        );
      }
      return res.json();
    },
    retry: false, // Don't keep retrying an invalid code
  });

  // Derive status. Show 'checking' only while debouncing or on the initial fetch
  // (isPending = no data yet). Background refetches are silent so the UI doesn't flash.
  let status: CertStatus = 'idle';
  if (code.trim()) {
    if (debouncedCode !== code.trim() || checkQuery.isPending) {
      status = 'checking';
    } else if (checkQuery.isSuccess) {
      status = 'valid';
    } else if (checkQuery.isError) {
      const error = checkQuery.error as Error & { codeIsInvalid?: boolean };
      status = error.codeIsInvalid ? 'invalid' : 'unavailable';
    }
  }

  const info: CertInfo | null = checkQuery.data ?? null;

  /** Set a new code and persist it. Skips debounce for immediate validation. */
  const applyCode = useCallback(async (newCode: string) => {
    const trimmed = newCode.trim();
    setCodeState(trimmed);
    // Apply immediately (no debounce) when selected via "Tap to Use".
    setDebouncedCode(trimmed);
    if (trimmed) {
      await AsyncStorage.setItem(storageKey(userId), trimmed);
    } else {
      await AsyncStorage.removeItem(storageKey(userId));
    }
  }, [userId]);

  const clearCode = useCallback(async () => {
    setCodeState('');
    setDebouncedCode('');
    await AsyncStorage.removeItem(storageKey(userId));
  }, [userId]);

  return { code, applyCode, clearCode, status, info };
}
