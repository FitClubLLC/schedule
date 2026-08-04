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

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const isLoading = fetchStatus === 'fetching';

  const handleSignIn = async () => {
    if (!email || !password || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          router.replace('/(tabs)');
        },
      });
    } else if (signIn.status === 'needs_client_trust') {
      const emailFactor = signIn.supportedSecondFactors?.find(
        (f: any) => f.strategy === 'email_code',
      );
      if (emailFactor) await (signIn as any).mfa?.sendEmailCode();
    }
  };

  const handleVerify = async () => {
    if (!verifyCode || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await (signIn as any).mfa?.verifyEmailCode({ code: verifyCode });
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          router.replace('/(tabs)');
        },
      });
    }
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 20);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 24);

  if (signIn.status === 'needs_client_trust') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.inner,
            { paddingTop: topPad, paddingBottom: bottomPad },
          ]}
        >
          <Text style={[styles.title, { color: colors.primary }]}>
            CHECK YOUR EMAIL
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the code we sent you
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder="6-digit code"
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
              { backgroundColor: colors.primary },
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
                VERIFY
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => (signIn as any).mfa?.sendEmailCode()}
            style={styles.linkRow}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Resend code
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signIn.reset()} style={styles.linkRow}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
              Start over
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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

        <Text style={[styles.title, { color: colors.primary }]}>
          MEMBER LOGIN
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          GET IN. GET OUT. GET ON WITH LIFE.
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
            placeholder="Email address"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          {errors?.fields?.identifier && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errors.fields.identifier.message}
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
            onPress={handleSignIn}
            disabled={!email || !password || isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
                SIGN IN
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Not a member?{' '}
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Join Fit Club
              </Text>
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
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 28,
    alignItems: 'center',
  },
  logo: {
    width: 180,
    height: 90,
  },
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
  form: {
    width: '100%',
    gap: 10,
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
  linkRow: {
    marginTop: 16,
  },
  linkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
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
