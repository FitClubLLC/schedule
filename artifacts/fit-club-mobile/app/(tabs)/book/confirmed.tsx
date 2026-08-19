import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getGetUpcomingAppointmentsQueryKey,
  getGetPastAppointmentsQueryKey,
  getGetAppointmentSummaryQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import SvgIcon, { SvgIconName } from '@/components/SvgIcon';
import {
  getCompleteBookingConfirmation,
  type BookingConfirmationRouteParams,
} from '@/lib/bookingNavigation';

export default function ConfirmedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const routeParams = useLocalSearchParams<{
    appointmentId: string;
    appointmentType: string;
    dateDisplay: string;
    timeDisplay: string;
    locationName: string;
    calendar: string;
  }>() as BookingConfirmationRouteParams;
  const confirmation = getCompleteBookingConfirmation(routeParams);
  const hasConfirmation = confirmation !== null;

  // A confirmation route without a complete successful appointment result can
  // only be stale or malformed navigation state. Return to the entry flow
  // without ever presenting a false success screen.
  useEffect(() => {
    if (hasConfirmation) return;
    router.replace('/(tabs)/book');
  }, [hasConfirmation, router]);

  // Invalidate appointment caches so Sessions and Dashboard reflect the new
  // booking immediately. Invalid routes must not trigger this refresh.
  useEffect(() => {
    if (!hasConfirmation) return;
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPastAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['member-certificates'] });
  }, [hasConfirmation, queryClient]);

  if (!confirmation) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Returning to booking"
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {/* ── Success mark ─────────────────────────────────────────── */}
      <View style={styles.topSection}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: 'rgba(34,197,94,0.10)',
              borderColor: 'rgba(34,197,94,0.30)',
            },
          ]}
        >
          <SvgIcon name="check" size={32} color="#22c55e" />
        </View>

        <Text style={[styles.title, { color: '#22c55e' }]}>YOU'RE BOOKED!</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          A confirmation is on its way.
        </Text>
      </View>

      {/* ── Booking summary card ─────────────────────────────────── */}
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <DetailRow icon="info"     value={confirmation.appointmentType} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="map-pin"  value={confirmation.locationName} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="calendar" value={confirmation.dateDisplay} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="clock"    value={confirmation.timeDisplay} colors={colors} />
      </View>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => router.navigate('/(tabs)/appointments')}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <SvgIcon name="calendar" size={17} color={colors.primaryForeground} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            VIEW MY SESSIONS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/book')}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
            BOOK ANOTHER SESSION
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface DetailRowProps {
  icon: SvgIconName;
  value: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}

function DetailRow({ icon, value, colors }: DetailRowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.iconWrap, { backgroundColor: 'rgba(211,175,55,0.10)' }]}>
        <SvgIcon name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={[rowStyles.value, { color: colors.foreground }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 28,
    gap: 10,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 36,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  divider: {
    height: 1,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 14,
  },
  primaryBtnText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
