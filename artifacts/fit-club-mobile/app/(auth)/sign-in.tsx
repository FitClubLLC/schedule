import React, { useState, useEffect } from 'react';
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

type Screen = 'login' | 'forgot-email' | 'forgot-code' | 'client-trust';

export default function SignInScreen() {
  // ── Clerk hooks ────────────────────────────────────────────────────────────
  // useSignIn().isLoaded never reliably becomes true after sign-out in
  // @clerk/expo ^4.  useAuth().isLoaded is the correct gate.
  const { isLoaded } = useAuth();
  const { signIn } = useSignIn();
  const clerk = useClerk();

  // ── UI hooks ───────────────────────────────────────────────────────────────
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── State — ALL declarations before any derived values ────────────────────
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
  const [clientTrustCode, setClientTrustCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // ── Derived values — after all state is declared ───────────────────────────
  // useAuth().isLoaded is the Expo-safe readiness gate. Do not gate on the
  // signIn resource itself: Clerk can rehydrate that resource after sign-out.
  const signInReady = isLoaded;

  // ── Helpers ────────────────────────────────────────────────────────────────
  /**
   * Evict any ghost sessions that survived a previous signOut().
   * After signOut(), the Clerk client object can still hold a reference to the
   * previous session.  Calling signIn.create() while that reference exists
   * causes Clerk to throw session_exists.  We sign out explicitly here so that
   * create() always starts from a clean slate.
   */
  const evictGhostSessions = async () => {
    try {
      const client = (clerk as any).client;
      const ghosts: Array<{ id: string }> = client?.activeSessions ?? [];
      if (ghosts.length > 0) {
        await clerk.signOut();
      }
    } catch {
      // Non-fatal — proceed with sign-in attempt regardless.
    }
  };

  /**
   * Reload the server-authoritative Clerk client before starting a new attempt.
   * This clears the completed sign-in resource that can survive signOut() in
   * memory, while the timeout prevents a stalled network request from freezing
   * the form indefinitely.
   */
  const refreshClerkClient = async (): Promise<boolean> => {
    const client = (clerk as any).client;
    if (!client?.fetch) {
      setError('Authentication is not ready yet. Please try again.');
      return false;
    }

    try {
      await Promise.race([
        client.fetch(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Clerk refresh timed out')), 2000);
        }),
      ]);
      return true;
    } catch {
      setError('Could not refresh your sign-in session. Check your connection and try again.');
      return false;
    }
  };

  const prepareSignInAttempt = async (): Promise<boolean> => {
    await evictGhostSessions();
    return refreshClerkClient();
  };

  // Check on mount whether biometric sign-in is available and credentials are saved.
  useEffect(() => {
    (async () => {
      const [available, saved] = await Promise.all([isBiometricAvailable(), hasSavedCreds()]);
      setBiometricReady(available && saved);
    })();
  }, []);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  const clearError = () => {
    setError('');
    setNotice('');
  };

  const goBack = () => {
    clearError();
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setClientTrustCode('');
    setScreen('login');
  };

  const incompleteSignInMessage = (status: string) => {
    switch (status) {
      case 'needs_identifier':
        return 'Enter your email address and password to continue.';
      case 'needs_first_factor':
        return 'Your sign-in needs another verification method. Please try again.';
      case 'needs_new_password':
        return 'Your account requires a new password. Use Forgot password to continue.';
      case 'needs_protect_check':
        return 'A security check is required before sign-in can continue. Please try again.';
      case 'needs_second_factor':
        return 'Two-factor authentication is enabled on this account. Please disable it in your account settings and try again.';
      default:
        return 'Your sign-in needs an additional security step. Please try again or contact Fit Club support.';
    }
  };

  const finishSignIn = async () => {
    if (!signIn || signIn.status !== 'complete') {
      setError(incompleteSignInMessage(signIn?.status ?? 'unknown'));
      return;
    }

    const finalized = await signIn.finalize();
    if (finalized.error) {
      setError(finalized.error.longMessage ?? finalized.error.message ?? 'Your sign-in was verified, but the session could not start. Please try again.');
      return;
    }

    // Refresh the server-authoritative user before mounting the member tabs.
    // Invitation-created users can have their Clerk name fields populated even
    // when the pre-sign-in user resource was still blank.
    try {
      await clerk.user?.reload();
    } catch {
      // Authentication is already complete; a refresh failure should not block
      // the member from entering the app.
    }

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
  };

  const beginClientTrustVerification = async () => {
    if (!signIn) {
      setError('Authentication not ready — please try again.');
      return;
    }

    const emailCodeFactor = signIn.supportedSecondFactors.find(
      (factor) => factor.strategy === 'email_code',
    );
    if (!emailCodeFactor) {
      setError('This sign-in requires device verification, but email verification is unavailable for this account.');
      return;
    }

    const sent = await signIn.mfa.sendEmailCode();
    if (sent.error) {
      setError(sent.error.longMessage ?? sent.error.message ?? 'We could not send your verification code. Please try again.');
      return;
    }

    setClientTrustCode('');
    setScreen('client-trust');
  };

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!signInReady || !email || !password || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      if (!await prepareSignInAttempt()) return;
      if (!signIn) {
        setError('Authentication not ready — please try again.');
        return;
      }

      const result = await signIn.password({
        emailAddress: email.trim(),
        password,
      });
      if (result.error) {
        setError(result.error.longMessage ?? result.error.message ?? 'Incorrect email or password.');
        return;
      }

      if (signIn.status === 'complete') {
        await finishSignIn();
      } else if (signIn.status === 'needs_client_trust') {
        await beginClientTrustVerification();
      } else {
        setError(incompleteSignInMessage(signIn.status));
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? '';
      // session_exists / single_session_mode: the Clerk client still holds a
      // reference to the previous session even though React state shows signed
      // out. Activate that session and go straight to the app.
      if (code === 'session_exists' || code === 'single_session_mode') {
        try {
          const sessionId = signIn?.existingSession?.sessionId ?? (clerk as any).client?.activeSessions?.[0]?.id;
          if (sessionId) {
            await clerk.setActive({ session: sessionId });
          }
        } catch { /* ignore — router.replace below will handle it */ }
        router.replace('/(tabs)');
        return;
      }
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Incorrect email or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClientTrustVerification = async () => {
    if (!signIn || !clientTrustCode.trim() || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      const verified = await signIn.mfa.verifyEmailCode({ code: clientTrustCode.trim() });
      if (verified.error) {
        setError(verified.error.longMessage ?? verified.error.message ?? 'That verification code could not be confirmed. Please try again.');
        return;
      }

      if (signIn.status === 'complete') {
        await finishSignIn();
      } else {
        setError(incompleteSignInMessage(signIn.status));
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'That verification code could not be confirmed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendClientTrustCode = async () => {
    if (!signIn || loading) return;
    setLoading(true);
    clearError();
    try {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) {
        setError(sent.error.longMessage ?? sent.error.message ?? 'We could not send a new verification code. Please try again.');
        return;
      }
      setClientTrustCode('');
      setNotice('A new verification code was sent to your email.');
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'We could not send a new verification code. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Biometric sign in ──────────────────────────────────────────────────────
  const handleBiometricSignIn = async () => {
    if (!signInReady || biometricLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBiometricLoading(true);
    clearError();
    try {
      const creds = await authenticateWithBiometrics();
      if (!creds) return; // cancelled or failed — do nothing, let user try password

      if (!await prepareSignInAttempt()) return;
      if (!signIn) {
        setError('Authentication not ready — please try again.');
        return;
      }

      const result = await signIn.password({
        emailAddress: creds.email,
        password: creds.password,
      });
      if (result.error) {
        setError(result.error.longMessage ?? result.error.message ?? 'Biometric sign in failed. Please use your password.');
        return;
      }

      if (signIn.status === 'complete') {
        const finalized = await signIn.finalize();
        if (finalized.error) {
          setError(finalized.error.longMessage ?? finalized.error.message ?? 'Biometric sign in failed. Please use your password.');
          return;
        }
        try {
          await clerk.user?.reload();
        } catch {
          // Authentication is already complete; continue with the signed-in app.
        }
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
    setLoading(true);
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (!await prepareSignInAttempt()) return;
      if (!signIn) { setError('Still loading — please try again in a moment.'); return; }

      const started = await signIn.create({
        identifier: resetEmail.trim(),
      });
      if (started.error) {
        setError(started.error.longMessage ?? started.error.message ?? 'Could not start password reset. Please try again.');
        return;
      }

      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) {
        setError(sent.error.longMessage ?? sent.error.message ?? 'Could not send reset code. Check the email address and try again.');
        return;
      }

      setScreen('forgot-code');
    } catch (err: any) {
      if (__DEV__) console.log('[ForgotPassword] create error:', err?.errors?.[0]?.code ?? err?.message);
      const code = err?.errors?.[0]?.code ?? '';
      if (code === 'session_exists' || code === 'single_session_mode') {
        setError('You are already signed in. Return to the app or sign out before resetting your password.');
        return;
      }
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

    if (!signIn) {
      setError('Reset session lost — go back and request a new code.');
      return;
    }

    setLoading(true);
    clearError();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({
        code: resetCode.trim(),
      });
      if (verified.error) {
        setError(verified.error.longMessage ?? verified.error.message ?? 'Invalid or expired code.');
        return;
      }

      const completed = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
      });
      if (completed.error) {
        setError(completed.error.longMessage ?? completed.error.message ?? 'Could not update your password. Please try again.');
        return;
      }

      if (signIn.status === 'complete') {
        const finalized = await signIn.finalize();
        if (finalized.error) {
          setError(finalized.error.longMessage ?? finalized.error.message ?? 'Password updated, but your session could not start. Please sign in.');
          return;
        }
        router.replace('/(tabs)');
      } else {
        setError(`Unexpected status: ${signIn.status}. Please try again.`);
      }
    } catch (err: any) {
      if (__DEV__) console.log('[ForgotPassword] attemptFirstFactor error:', err?.errors?.[0]?.code ?? err?.message);
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
    if (screen === 'client-trust') {
      return (
        <>
          <TouchableOpacity onPress={goBack} style={styles.backRow} hitSlop={12}>
            <SvgIcon name="arrow-left" size={18} color={colors.mutedForeground} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.primary }]}>VERIFY THIS DEVICE</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            We sent a verification code to your email to confirm this new device.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              value={clientTrustCode}
              onChangeText={(v) => { setClientTrustCode(v); clearError(); }}
              keyboardType="number-pad"
              autoCorrect={false}
              autoFocus
            />

            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
            {!!notice && <Text style={[styles.errorText, { color: colors.primary }]}>{notice}</Text>}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, (!clientTrustCode.trim() || loading) && styles.buttonDisabled]}
              onPress={handleClientTrustVerification}
              disabled={!clientTrustCode.trim() || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>VERIFY &amp; SIGN IN</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendClientTrustCode}
              style={styles.resendRow}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>Send a new code</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

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
            disabled={!signInReady || !email || !password || loading}
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
  resendRow: { alignSelf: 'center', marginTop: 8 },
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
