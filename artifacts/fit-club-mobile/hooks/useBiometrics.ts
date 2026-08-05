import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const CREDS_KEY = 'fitclub_biometric_creds';

export interface StoredCreds {
  email: string;
  password: string;
}

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function hasSavedCreds(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(CREDS_KEY);
  return !!raw;
}

export async function saveCreds(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify({ email, password }));
}

export async function clearCreds(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDS_KEY);
}

export async function authenticateWithBiometrics(): Promise<StoredCreds | null> {
  const available = await isBiometricAvailable();
  if (!available) return null;

  const saved = await SecureStore.getItemAsync(CREDS_KEY);
  if (!saved) return null;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Sign in to Fit Club',
    fallbackLabel: 'Use Password',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (!result.success) return null;

  return JSON.parse(saved) as StoredCreds;
}
