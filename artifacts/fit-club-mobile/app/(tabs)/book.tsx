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
  const locs: MobileLocation[] = [];
  const n1 = process.env.EXPO_PUBLIC_LOCATION_1_NAME;
  const c1 = process.env.EXPO_PUBLIC_LOCATION_1_CALENDAR_ID;
  const n2 = process.env.EXPO_PUBLIC_LOCATION_2_NAME;
  const c2 = process.env.EXPO_PUBLIC_LOCATION_2_CALENDAR_ID;
  if (n1 && c1) locs.push({ id: '1', name: n1, calendarId: c1 });
  if (n2 && c2) locs.push({ id: '2', name: n2, calendarId: c2 });
  return locs;
}

// Two accent colours for up to 2 locations
const LOC_ACCENT = ['#D3AF37', '#4A9EFF'];

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const [isOpening, setIsOpening] = useState(false);
  const [selected, setSelected] = useState<MobileLocation | null>(null);

  const locations = getMobileLocations();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  const handleBook = async (loc: MobileLocation) => {
    if (!isLoaded) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpening(true);

    const baseUrl =
      process.env.EXPO_PUBLIC_ACUITY_CALENDAR_URL ||
      'https://app.acuityscheduling.com/schedule.php?owner=36930698';

    const url = new URL(baseUrl);
    url.searchParams.set('calendarID', loc.calendarId);
    if (user) {
      if (user.firstName) url.searchParams.set('firstName', user.firstName);
      if (user.lastName)  url.searchParams.set('lastName',  user.lastName);
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

  // Single-calendar fallback (no locations configured)
  const handleBookSingle = async () => {
    if (!isLoaded) return;
    setIsOpening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const baseUrl =
      process.env.EXPO_PUBLIC_ACUITY_CALENDAR_URL ||
      'https://app.acuityscheduling.com/schedule.php?owner=36930698';
    const url = new URL(baseUrl);
    if (user) {
      if (user.firstName) url.searchParams.set('firstName', user.firstName);
      if (user.lastName)  url.searchParams.set('lastName',  user.lastName);
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>BOOK A SESSION</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {locations.length === 0 ? (
          // ── Fallback: no location env vars set ─────────────────────────
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Select a time with your trainer
            </Text>
            <TouchableOpacity
              style={[styles.bookBtn, { backgroundColor: colors.primary }, (!isLoaded || isOpening) && styles.btnDisabled]}
              onPress={handleBookSingle}
              disabled={!isLoaded || isOpening}
              activeOpacity={0.85}
            >
              {isOpening
                ? <ActivityIndicator color={colors.primaryForeground} />
                : (
                  <>
                    <Feather name="calendar" size={20} color={colors.primaryForeground} />
                    <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>BOOK NOW</Text>
                  </>
                )}
            </TouchableOpacity>
          </>
        ) : (
          // ── Location picker ────────────────────────────────────────────
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Choose your location
            </Text>
            {locations.map((loc, i) => {
              const accent = LOC_ACCENT[i % LOC_ACCENT.length];
              const isBooking = isOpening && selected?.id === loc.id;
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
                  onPress={() => {
                    setSelected(loc);
                    handleBook(loc);
                  }}
                  disabled={isOpening}
                  activeOpacity={0.8}
                >
                  <View style={[styles.locDot, { backgroundColor: accent + '22' }]}>
                    <Feather name="map-pin" size={18} color={accent} />
                  </View>
                  <View style={styles.locText}>
                    <Text style={[styles.locName, { color: colors.foreground }]}>{loc.name}</Text>
                    <Text style={[styles.locSub, { color: colors.mutedForeground }]}>
                      Tap to see available times
                    </Text>
                  </View>
                  {isBooking
                    ? <ActivityIndicator size="small" color={accent} />
                    : <Feather name="chevron-right" size={20} color={accent} />}
                </TouchableOpacity>
              );
            })}

            {user && (
              <View style={[styles.memberInfo, { backgroundColor: colors.muted }]}>
                <Feather name="user" size={14} color={colors.primary} />
                <Text style={[styles.memberText, { color: colors.mutedForeground }]}>
                  {user.firstName} {user.lastName} · {user.primaryEmailAddress?.emailAddress}
                </Text>
              </View>
            )}
          </>
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
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 14,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
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
  locDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locText: { flex: 1, gap: 3 },
  locName: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  locSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 18,
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  bookBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 20,
    letterSpacing: 2.5,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  memberText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    flex: 1,
  },
});
