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
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import SvgIcon from '@/components/SvgIcon';

type Step = 'form' | 'verify';

export default function SignUpScreen() {
  // @clerk/expo v4 — useSignUp() no longer returns `isLoaded` or `setActive`.
  // The `signUp` object is a SignUpFuture; use signUp.password(), signUp.verifications.*,
  // and signUp.finalize() instead of the old v2 create/prepare/attempt/setActive API.
  const { signUp, fetchStatus } = useSignUp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  const busy = loading || fetchStatus === 'fetching';

  const clearError = () => setError('');

  // ── Sign up: create account + send verification code ──────────────────────
  const handleSignUp = async () => {
    if (!email || !password || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      // v4 API: signUp.password() only accepts emailAddress + password.
      // firstName/lastName are not supported at this stage.
      const result = await (signUp as any).password({
        emailAddress: email.trim(),
        password,
      });
      if (result?.error) {
        setError(result.error.longMessage ?? result.error.message ?? 'Could not create account. Please try again.');
        return;
      }
      await (signUp as any).verifications.sendEmailCode();
      setStep('verify');
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        'Could not create account. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Verify email ───────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!verifyCode || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    clearError();
    try {
      await (signUp as any).verifications.verifyEmailCode({ code: verifyCode });
      if ((signUp as any).status === 'complete') {
        await (signUp as any).finalize({
          navigate: () => { router.replace('/(tabs)'); },
        });
      } else {
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        'Invalid verification code.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Resend verification code ───────────────────────────────────────────────
  const handleResend = async () => {
    if (busy) return;
    setLoading(true);
    clearError();
    try {
      await (signUp as any).verifications.sendEmailCode();
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? 'Could not resend code.');
    } finally {
      setLoading(false);
    }
  };

  // ── Email verification screen ──────────────────────────────────────────────
  if (step === 'verify') {
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
            Enter the verification code sent to {email}
          </Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              value={verifyCode}
              onChangeText={(v) => { setVerifyCode(v); clearError(); }}
              keyboardType="number-pad"
              autoFocus
            />
            {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, marginTop: 8 }, (!verifyCode || busy) && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={!verifyCode || busy}
              activeOpacity={0.8}
            >
              {busy
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>VERIFY & JOIN</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ marginTop: 20 }} onPress={handleResend} disabled={busy}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Resend code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 10 }} onPress={() => { setStep('form'); clearError(); }}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>← Go back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Sign-up form ───────────────────────────────────────────────────────────
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

        <Text style={[styles.title, { color: colors.primary }]}>JOIN FIT CLUB</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Create your member account</Text>

        <View style={styles.form}>
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, styles.halfInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.input, styles.halfInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Last name"
              placeholderTextColor={colors.mutedForeground}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>

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
              placeholder="Password (min 8 chars)"
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
            style={[styles.button, { backgroundColor: colors.primary, marginTop: 8 }, (!email || !password || busy) && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={!email || !password || busy}
            activeOpacity={0.8}
          >
            {busy
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>CREATE ACCOUNT</Text>}
          </TouchableOpacity>
        </View>

        {/* Required by Clerk for bot protection */}
        <View nativeID="clerk-captcha" />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already a member? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Sign in</Text>
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
  logoContainer: { marginBottom: 24, alignItems: 'center' },
  logo: { width: 160, height: 80 },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 34,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
  },
  form: { width: '100%', gap: 10 },
  nameRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
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
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 18,
    letterSpacing: 2.5,
  },
  linkText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 28 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  footerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
