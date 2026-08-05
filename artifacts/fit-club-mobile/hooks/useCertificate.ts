import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';

const STORAGE_KEY = '@fitclub/certificate';

export type CertStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export interface CertInfo {
  productName: string;
  remainingValue: string;
}

export function useCertificate() {
  const { getToken } = useAuth();
  const [code, setCodeState] = useState('');
  // Separate debounced value so we don't hit the API on every keystroke,
  // but still fire immediately when a code is applied via "Tap to Use".
  const [debouncedCode, setDebouncedCode] = useState('');
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // Load persisted code on mount — skip debounce so the banner appears instantly.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        setCodeState(stored);
        setDebouncedCode(stored);
      }
    });
  }, []);

  // Debounce manual keystrokes; clear immediately when the field is cleared.
  useEffect(() => {
    if (!code.trim()) {
      setDebouncedCode('');
      return;
    }
    const timer = setTimeout(() => setDebouncedCode(code.trim()), 600);
    return () => clearTimeout(timer);
  }, [code]);

  // React Query owns the /check fetch.
  // Because the global QueryClient has staleTime:0 and refetchInterval:60_000,
  // and the focusManager is wired to AppState, this query automatically re-fetches
  // when the user returns from the Acuity booking browser — no manual recheck needed.
  const checkQuery = useQuery<CertInfo>({
    queryKey: ['cert-check', debouncedCode],
    enabled: !!debouncedCode,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${baseUrl}/api/booking/certificates/check?certificate=${encodeURIComponent(debouncedCode)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Invalid certificate');
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
      status = 'invalid';
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
      await AsyncStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clearCode = useCallback(async () => {
    setCodeState('');
    setDebouncedCode('');
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { code, applyCode, clearCode, status, info };
}
