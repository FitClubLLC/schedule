// Web stub — biometrics are not available in a browser.
// Metro picks this file automatically for the web bundle.

export interface StoredCreds {
  email: string;
  password: string;
}

export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function hasSavedCreds(): Promise<boolean> {
  return false;
}

export async function saveCreds(_email: string, _password: string): Promise<void> {}

export async function clearCreds(): Promise<void> {}

export async function authenticateWithBiometrics(): Promise<StoredCreds | null> {
  return null;
}
