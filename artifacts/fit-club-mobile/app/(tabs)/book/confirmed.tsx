import React, { useEffect } from 'react';
import {
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

export default function ConfirmedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    appointmentType,
    dateDisplay,
    timeDisplay,
    locationName,
    calendar,
  } = useLocalSearchParams<{
    appointmentId: string;
    appointmentType: string;
    dateDisplay: string;
    timeDisplay: string;
    locationName: string;
    calendar: string;
  }>();

  // Invalidate appointment caches so Sessions and Dashboard show the new booking immediately.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPastAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['member-certificates'] });
  }, []);

  const displayLocation = calendar || locationName;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* ── Success icon ────────────────────────────────────────── */}
      <View style={styles.topSection}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' }]}>
          <SvgIcon name="check" size={40} color="#22c55e" />
        </View>
        <Text style={[styles.title, { color: '#22c55e' }]}>YOU'RE BOOKED!</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your session has been confirmed.
        </Text>
      </View>

      {/* ── Booking summary card ─────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <DetailRow icon="info" value={appointmentType} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="calendar" value={dateDisplay} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="clock" value={timeDisplay} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <DetailRow icon="map-pin" value={displayLocation} colors={colors} />
      </View>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => router.navigate('/(tabs)/appointments')}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <SvgIcon name="calendar" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
            VIEW MY SESSIONS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.navigate('/(tabs)/book')}
          activeOpacity={0.8}
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

interface DetailRowProps {
  icon: SvgIconName;
  value: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}

function DetailRow({ icon, value, colors }: DetailRowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.iconWrap, { backgroundColor: 'rgba(211,175,55,0.12)' }]}>
        <SvgIcon name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[rowStyles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    gap: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    marginBottom: 32,
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
