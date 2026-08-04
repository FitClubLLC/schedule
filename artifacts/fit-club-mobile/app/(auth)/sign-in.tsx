import React, { useState } from 'react';
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
} from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

type Screen = 'login' | 'forgot-email' | 'forgot-code';

export default function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
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
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
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

  // ── Send reset code ────────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (!isLoaded || !signIn || !resetEmail.trim() || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: resetEmail.trim(),
      });
      setScreen('forgot-code');
    } catch (err: any) {
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
    if (!isLoaded || !signIn || !resetCode || !newPassword || loading) return;
    if (newPassword !== confirmPassword) {
      setError('Passwords don\'t match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode.trim(),
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Reset could not be completed. Please try again.');
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Invalid or expired code. Please try again.',
      );
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
            <Feather name="arrow-left" size={18} color={colors.mutedForeground} />
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
              style={[styles.button, { backgroundColor: colors.primary }, (!isLoaded || !signIn || !resetEmail.trim() || loading) && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={!isLoaded || !signIn || !resetEmail.trim() || loading}
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
            <Feather name="arrow-left" size={18} color={colors.mutedForeground} />
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
                <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
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
              style={[styles.button, { backgroundColor: colors.primary }, (!isLoaded || !signIn || !resetCode || !newPassword || !confirmPassword || loading) && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!isLoaded || !signIn || !resetCode || !newPassword || !confirmPassword || loading}
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
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
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
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 32 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
