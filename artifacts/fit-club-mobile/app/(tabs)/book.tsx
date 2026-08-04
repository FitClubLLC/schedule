import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const [isOpening, setIsOpening] = React.useState(false);

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const handleBook = async () => {
    if (!isLoaded) return;
    setIsOpening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const baseUrl =
      process.env.EXPO_PUBLIC_ACUITY_CALENDAR_URL ||
      'https://app.acuityscheduling.com/schedule.php?owner=36930698';

    const url = new URL(baseUrl);
    if (user) {
      if (user.firstName) url.searchParams.set('firstName', user.firstName);
      if (user.lastName) url.searchParams.set('lastName', user.lastName);
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) url.searchParams.set('email', email);
    }

    await WebBrowser.openBrowserAsync(url.toString(), {
      toolbarColor: '#0D0D0D',
      controlsColor: '#D3AF37',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
    setIsOpening(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>BOOK A SESSION</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Gold accent line */}
          <View style={[styles.cardAccent, { backgroundColor: colors.primary }]} />

          <Image
            source={require('@/assets/images/fitclub-logo.png')}
            style={styles.cardLogo}
            resizeMode="contain"
          />

          <Text style={[styles.cardHeading, { color: colors.primary }]}>
            15-MINUTE STRENGTH TRAINING
          </Text>
          <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
            Cutting-edge strength training in a fraction of the time. Your name and email
            will be pre-filled when the booking page opens.
          </Text>

          {user && (
            <View style={[styles.memberInfo, { backgroundColor: colors.muted }]}>
              <Feather name="user" size={14} color={colors.primary} />
              <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
                {user.firstName} {user.lastName} · {user.primaryEmailAddress?.emailAddress}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.bookBtn,
            { backgroundColor: colors.primary },
            (!isLoaded || isOpening) && styles.btnDisabled,
          ]}
          onPress={handleBook}
          disabled={!isLoaded || isOpening}
          activeOpacity={0.85}
        >
          {isOpening ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Feather name="calendar" size={20} color={colors.primaryForeground} />
              <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>
                BOOK NOW
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardLogo: {
    width: 120,
    height: 60,
    marginBottom: 4,
  },
  cardHeading: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 20,
    letterSpacing: 1.5,
  },
  cardBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  memberText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    flex: 1,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 18,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  bookBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 20,
    letterSpacing: 2.5,
  },
});
