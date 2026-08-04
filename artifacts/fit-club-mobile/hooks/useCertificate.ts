import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';

const STORAGE_KEY = '@fitclub/certificate';

export type CertStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export interface CertInfo {
  productName: string;
  remainingValue: string;
}

export function useCertificate() {
  const { getToken } = useAuth();
  const [code, setCodeState] = useState('');
  const [status, setStatus] = useState<CertStatus>('idle');
  const [info, setInfo] = useState<CertInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // Load persisted code on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setCodeState(stored);
    });
  }, []);

  // Validate with debounce whenever code changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = code.trim();
    if (!trimmed) {
      setStatus('idle');
      setInfo(null);
      return;
    }
    setStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${baseUrl}/api/booking/certificates/check?certificate=${encodeURIComponent(trimmed)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setStatus('valid');
          setInfo({ productName: data.productName, remainingValue: data.remainingValue });
        } else {
          setStatus('invalid');
          setInfo(null);
        }
      } catch {
        setStatus('invalid');
        setInfo(null);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, baseUrl, getToken]);

  /** Set a new code and persist it. Pass empty string to clear. */
  const applyCode = useCallback(async (newCode: string) => {
    const trimmed = newCode.trim();
    setCodeState(trimmed);
    if (trimmed) {
      await AsyncStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clearCode = useCallback(async () => {
    setCodeState('');
    setStatus('idle');
    setInfo(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { code, applyCode, clearCode, status, info };
}
