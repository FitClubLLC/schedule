import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

interface MobileLocation {
  id: string;
  name: string;
  calendarId: string;
}

function getMobileLocations(): MobileLocation[] {
  return [
    {
      id:         '1',
      name:       process.env.EXPO_PUBLIC_LOCATION_1_NAME        ?? 'POTOMAC',
      calendarId: process.env.EXPO_PUBLIC_LOCATION_1_CALENDAR_ID ?? '',
    },
    {
      id:         '2',
      name:       process.env.EXPO_PUBLIC_LOCATION_2_NAME        ?? 'KENTLANDS',
      calendarId: process.env.EXPO_PUBLIC_LOCATION_2_CALENDAR_ID ?? '',
    },
  ];
}

const LOC_ACCENT = ['#D3AF37', '#4A9EFF'];

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const locations = getMobileLocations();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const handleBook = async (loc: MobileLocation) => {
    if (!isLoaded || openingId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOpeningId(loc.id);

    const baseUrl =
      process.env.EXPO_PUBLIC_ACUITY_CALENDAR_URL ??
      'https://app.acuityscheduling.com/schedule.php?owner=36930698';

    const url = new URL(baseUrl);
    // Only add calendarID filter when the env var is configured
    if (loc.calendarId) url.searchParams.set('calendarID', loc.calendarId);
    if (user?.firstName) url.searchParams.set('firstName', user.firstName);
    if (user?.lastName)  url.searchParams.set('lastName',  user.lastName);
    const email = user?.primaryEmailAddress?.emailAddress;
    if (email) url.searchParams.set('email', email);

    await WebBrowser.openBrowserAsync(url.toString(), {
      toolbarColor: '#0D0D0D',
      controlsColor: '#D3AF37',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
    setOpeningId(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>BOOK A SESSION</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          Choose your location
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {locations.map((loc, i) => {
          const accent = LOC_ACCENT[i % LOC_ACCENT.length];
          const isOpening = openingId === loc.id;
          return (
            <TouchableOpacity
              key={loc.id}
              style={[
                styles.locCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderLeftColor: accent,
                },
              ]}
              onPress={() => handleBook(loc)}
              disabled={!!openingId}
              activeOpacity={0.78}
            >
              <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
                <Feather name="map-pin" size={20} color={accent} />
              </View>

              <View style={styles.locText}>
                <Text style={[styles.locName, { color: colors.foreground }]}>{loc.name}</Text>
                <Text style={[styles.locSub, { color: colors.mutedForeground }]}>
                  Tap to see available times
                </Text>
              </View>

              {isOpening
                ? <ActivityIndicator size="small" color={accent} />
                : <Feather name="chevron-right" size={20} color={accent} />}
            </TouchableOpacity>
          );
        })}

        {user && (
          <View style={[styles.memberInfo, { backgroundColor: colors.muted }]}>
            <Feather name="user" size={13} color={colors.primary} />
            <Text style={[styles.memberText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {[user.firstName, user.lastName].filter(Boolean).join(' ')}
              {user.primaryEmailAddress?.emailAddress
                ? ` · ${user.primaryEmailAddress.emailAddress}`
                : ''}
            </Text>
          </View>
        )}

        {!locations[0].calendarId && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Set EXPO_PUBLIC_LOCATION_1_CALENDAR_ID and EXPO_PUBLIC_LOCATION_2_CALENDAR_ID to filter each location's availability.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 2,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 14,
  },
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 18,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locText: { flex: 1, gap: 3 },
  locName: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    letterSpacing: 1,
  },
  locSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
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
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
});
