import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useSignIn, useClerk, useAuth } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import SvgIcon from '@/components/SvgIcon';
import {
  isBiometricAvailable,
  hasSavedCreds,
  saveCreds,
  clearCreds,
  authenticateWithBiometrics,
} from '@/hooks/useBiometrics';

type Screen = 'login' | 'forgot-email' | 'forgot-code';

export default function SignInScreen() {
  // useSignIn().isLoaded never becomes true after sign-out in @clerk/expo ^4.
  // useAuth().isLoaded IS reliable — it tracks when Clerk finishes initialising
  // the session layer, which is the correct gate for both sign-in and reset flows.
  const { isLoaded } = useAuth();
  const { signIn: hookSignIn, setActive } = useSignIn();
  const clerk = useClerk();
  // hookSignIn is undefined while a cached session is being restored.
  // Fall back to clerk.client.signIn which is populated as soon as the client loads.
  const signIn = hookSignIn ?? (clerk as any).client?.signIn;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>('login');

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Captures the exact signIn instance used in handleSendCode so that
  // handleResetPassword calls attemptFirstFactor on the same object —
  // preventing a stale-reference mismatch if hookSignIn changes between renders.
  const signInRef = useRef<any>(null);

  // Check on mount whether biometric sign-in is available and credentials are saved.
  useEffect(() => {
    (async () => {
      const [available, saved] = await Promise.all([isBiometricAvailable(), hasSavedCreds()]);
      setBiometricReady(available && saved);
    })();
  }, []);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  const clearError = () => setError('');

  const goBack = () => {
    clearError();
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setScreen('login');
  };

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!isLoaded || !email || !password || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      // Treat createdSessionId as the canonical success signal — status can be
      // undefined in some @clerk/expo versions even when sign-in succeeded.
      const succeeded = result.status === 'complete' || !!result.createdSessionId;
      if (succeeded) {
        await setActive({ session: result.createdSessionId });
        // Offer biometric setup if available and not yet saved.
        const [available, saved] = await Promise.all([isBiometricAvailable(), hasSavedCreds()]);
        if (available && !saved) {
          Alert.alert(
            'Enable Fingerprint Login',
            'Sign in faster next time using your fingerprint or Face ID.',
            [
              { text: 'Not Now', style: 'cancel', onPress: () => router.replace('/(tabs)') },
              {
                text: 'Enable',
                onPress: async () => {
                  await saveCreds(email.trim(), password);
                  setBiometricReady(true);
                  router.replace('/(tabs)');
                },
              },
            ],
          );
        } else {
          router.replace('/(tabs)');
        }
      } else if (result.status === 'needs_second_factor') {
        setError('Two-factor authentication is enabled on this account. Please disable it in your account settings and try again.');
      } else {
        setError('Sign in could not be completed. Please try again.');
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Incorrect email or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Biometric sign in ──────────────────────────────────────────────────────
  const handleBiometricSignIn = async () => {
    if (!isLoaded || biometricLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBiometricLoading(true);
    clearError();
    try {
      const creds = await authenticateWithBiometrics();
      if (!creds) return; // cancelled or failed — do nothing, let user try password
      const result = await signIn.create({ identifier: creds.email, password: creds.password });
      const succeeded = result.status === 'complete' || !!result.createdSessionId;
      if (succeeded) {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Biometric sign in failed. Please use your password.');
      }
    } catch (err: any) {
      // Clerk error codes that indicate the stored password is no longer valid.
      const invalidCredCodes = [
        'form_password_incorrect',
        'form_identifier_not_found',
        'form_password_pwned',
        'single_session_mode',
      ];
      const errCode: string = err?.errors?.[0]?.code ?? '';
      const isInvalidCreds = invalidCredCodes.includes(errCode);

      if (isInvalidCreds) {
        // Stored password is stale — clear it and let the user sign in manually.
        await clearCreds();
        setBiometricReady(false);
        Alert.alert(
          'Password Changed',
          'Your saved login is out of date. Please sign in with your password — you can re-enable fingerprint login afterwards.',
          [{ text: 'OK' }],
        );
      } else {
        setError(
          err?.errors?.[0]?.longMessage ??
          err?.errors?.[0]?.message ??
          'Biometric sign in failed. Please use your password.',
        );
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  // ── Send reset code ────────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (loading || !isLoaded || !resetEmail.trim()) return;
    const si = (clerk as any).client?.signIn ?? hookSignIn;
    if (!si) { setError('Still loading — please try again in a moment.'); return; }
    setLoading(true);
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // create() returns the live attempt object — store IT, not the source ref.
      // This is the exact instance we must pass to attemptFirstFactor.
      const attempt = await si.create({
        strategy: 'reset_password_email_code',
        identifier: resetEmail.trim(),
      });
      signInRef.current = attempt;
      setScreen('forgot-code');
    } catch (err: any) {
      console.log('[ForgotPassword] create error:', JSON.stringify(err));
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Could not send reset code. Check the email address and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm reset ──────────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (loading || !isLoaded || !resetCode || !newPassword) return;
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }

    // Use ONLY the stored attempt — never re-fetch from clerk.client.
    // Re-fetching could return a different object and lose the session context.
    const si = signInRef.current;
    if (!si) {
      setError('Reset session lost — go back and request a new code.');
      return;
    }

    setLoading(true);
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await si.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode.trim(),
        password: newPassword,
      });
      if (result.status === 'complete') {
        await (clerk as any).setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError(`Unexpected status: ${result.status}. Please try again.`);
      }
    } catch (err: any) {
      console.log('[ForgotPassword] attemptFirstFactor error:', JSON.stringify(err));
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        'Invalid or expired code.';
      const errCode = err?.errors?.[0]?.code ? ` (${err.errors[0].code})` : '';
      setError(msg + errCode);
    } finally {
      setLoading(false);
    }
  };

  // ── Shared layout wrapper ──────────────────────────────────────────────────
  const renderContent = () => {
    if (screen === 'forgot-email') {
      return (
        <>
          <TouchableOpacity onPress={goBack} style={styles.backRow} hitSlop={12}>
            <SvgIcon name="arrow-left" size={18} color={colors.mutedForeground} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.primary }]}>RESET PASSWORD</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter your email and we'll send a reset code.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Email address"
              placeholderTextColor={colors.mutedForeground}
              value={resetEmail}
              onChangeText={(v) => { setResetEmail(v); clearError(); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoFocus
            />

            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, (!isLoaded || !resetEmail.trim() || loading) && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={!isLoaded || !resetEmail.trim() || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>SEND CODE</Text>}
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (screen === 'forgot-code') {
      return (
        <>
          <TouchableOpacity onPress={() => { clearError(); setScreen('forgot-email'); }} style={styles.backRow} hitSlop={12}>
            <SvgIcon name="arrow-left" size={18} color={colors.mutedForeground} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.primary }]}>NEW PASSWORD</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Check your email for the code, then set a new password.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Reset code"
              placeholderTextColor={colors.mutedForeground}
              value={resetCode}
              onChangeText={(v) => { setResetCode(v); clearError(); }}
              keyboardType="number-pad"
              autoFocus
            />

            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputInner, { color: colors.foreground }]}
                placeholder="New password (min 8 chars)"
                placeholderTextColor={colors.mutedForeground}
                value={newPassword}
                onChangeText={(v) => { setNewPassword(v); clearError(); }}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={8}>
                <SvgIcon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.mutedForeground}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError(); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, (!isLoaded || !resetCode || !newPassword || !confirmPassword || loading) && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!isLoaded || !resetCode || !newPassword || !confirmPassword || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>RESET PASSWORD</Text>}
            </TouchableOpacity>
          </View>
        </>
      );
    }

    // Default: login
    return (
      <>
        <View style={styles.logoContainer}>
          <Image source={require('@/assets/images/fitclub-logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <Text style={[styles.title, { color: colors.primary }]}>MEMBER LOGIN</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>GET IN. GET OUT. GET ON WITH LIFE.</Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Email address"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={(v) => { setEmail(v); clearError(); }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <TextInput
              style={[styles.inputInner, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={(v) => { setPassword(v); clearError(); }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={8}>
              <SvgIcon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

          <TouchableOpacity
            onPress={() => { clearError(); setResetEmail(email); setScreen('forgot-email'); }}
            style={styles.forgotRow}
            hitSlop={8}
          >
            <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, (!email || !password || loading) && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={!email || !password || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>SIGN IN</Text>}
          </TouchableOpacity>

          {biometricReady && (
            <TouchableOpacity
              style={[styles.biometricBtn, { borderColor: colors.border }]}
              onPress={handleBiometricSignIn}
              disabled={biometricLoading}
              activeOpacity={0.7}
            >
              {biometricLoading
                ? <ActivityIndicator color={colors.primary} />
                : <>
                    <SvgIcon name="fingerprint" size={22} color={colors.primary} />
                    <Text style={[styles.biometricText, { color: colors.primary }]}>Sign in with Fingerprint</Text>
                  </>}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Not a member? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Join Fit Club</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad, paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  backText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  logoContainer: { marginBottom: 28, alignItems: 'center' },
  logo: { width: 180, height: 90 },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 34,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 18,
  },
  form: { width: '100%', gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputInner: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: -4,
  },
  forgotRow: { alignSelf: 'flex-end', marginTop: -2 },
  forgotText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 18,
    letterSpacing: 2.5,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 4,
  },
  biometricText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 32 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
