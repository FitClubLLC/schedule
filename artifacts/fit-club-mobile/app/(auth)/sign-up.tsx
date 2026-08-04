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

type Step = 'form' | 'verify';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const isLoading = fetchStatus === 'fetching';

  const handleSignUp = async () => {
    if (!email || !password || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signUp.password({ emailAddress: email, password, firstName, lastName });
    if (error) return;
    await signUp.verifications.sendEmailCode();
    setStep('verify');
  };

  const handleVerify = async () => {
    if (!verifyCode || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await signUp.verifications.verifyEmailCode({ code: verifyCode });
    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          router.replace('/(tabs)');
        },
      });
    }
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  if (step === 'verify') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPad, paddingBottom: bottomPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.primary }]}>
            CHECK YOUR EMAIL
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the verification code sent to {email}
          </Text>
          <View style={styles.form}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              value={verifyCode}
              onChangeText={setVerifyCode}
              keyboardType="number-pad"
              autoFocus
            />
            {errors?.fields?.code && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {errors.fields.code.message}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: colors.primary, marginTop: 8 },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleVerify}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                  VERIFY & JOIN
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={{ marginTop: 16 }}
            onPress={() => signUp.verifications.sendEmailCode()}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>Resend code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 8 }} onPress={() => setStep('form')}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Go back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPad, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/fitclub-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={[styles.title, { color: colors.primary }]}>JOIN FIT CLUB</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Create your member account
        </Text>

        <View style={styles.form}>
          <View style={styles.nameRow}>
            <TextInput
              style={[
                styles.input,
                styles.halfInput,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={[
                styles.input,
                styles.halfInput,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Last name"
              placeholderTextColor={colors.mutedForeground}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="Email address"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          {errors?.fields?.emailAddress && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errors.fields.emailAddress.message}
            </Text>
          )}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {errors?.fields?.password && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errors.fields.password.message}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary, marginTop: 8 },
              (!email || !password || isLoading) && styles.buttonDisabled,
            ]}
            onPress={handleSignUp}
            disabled={!email || !password || isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                CREATE ACCOUNT
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Required by Clerk for bot protection */}
        <View nativeID="clerk-captcha" />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Already a member?{' '}
          </Text>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  logo: {
    width: 160,
    height: 80,
  },
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
  form: {
    width: '100%',
    gap: 10,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: -6,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 18,
    letterSpacing: 2.5,
  },
  linkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  footerLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
