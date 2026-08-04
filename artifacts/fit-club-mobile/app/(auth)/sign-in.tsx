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
  Alert,
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  const clearError = () => setError('');

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

  // ── Forgot password — step 1: send reset code ─────────────────────────────
  const handleSendResetCode = async () => {
    if (!isLoaded || !signIn || !email || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setScreen('forgot-code');
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        'Could not send reset code. Check the email and try again.';
      setError(msg);
      // Guarantee visibility — some error shapes don't render in the inline text
      Alert.alert('Reset failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password — step 2: verify code + set new password ─────────────
  const handleResetPassword = async () => {
    if (!isLoaded || !resetCode || !newPassword || loading) return;
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Could not reset password. Please try again.');
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Invalid code or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password — step 1 screen ───────────────────────────────────────
  if (screen === 'forgot-email') {
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
          <TouchableOpacity onPress={() => { setScreen('login'); clearError(); }} style={styles.backRow} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
            <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back to sign in</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.primary }]}>FORGOT PASSWORD</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter your email and we'll send you a reset code.
          </Text>

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
              autoFocus
            />
            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, marginTop: 8 }, (!email || loading || !isLoaded) && styles.buttonDisabled]}
              onPress={handleSendResetCode}
              disabled={!email || loading || !isLoaded}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>SEND RESET CODE</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Forgot password — step 2 screen ───────────────────────────────────────
  if (screen === 'forgot-code') {
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
          <Text style={[styles.title, { color: colors.primary }]}>CHECK YOUR EMAIL</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the code sent to {email} and choose a new password.
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
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNewPassword(v => !v)} hitSlop={8}>
                <Feather name={showNewPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, marginTop: 8 }, (!resetCode || !newPassword || loading) && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!resetCode || !newPassword || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>SET NEW PASSWORD</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => { setScreen('forgot-email'); clearError(); }}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>← Resend code</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Main sign-in screen ────────────────────────────────────────────────────
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
            onPress={() => { setScreen('forgot-email'); clearError(); }}
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
  logoContainer: { marginBottom: 28, alignItems: 'center' },
  logo: { width: 180, height: 90 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 32,
  },
  backText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
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
  linkText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 32 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
