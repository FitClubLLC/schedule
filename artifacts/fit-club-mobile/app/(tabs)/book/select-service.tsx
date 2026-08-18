/**
 * SelectService — mobile service-selection step.
 *
 * Shown when the chosen location supports more than one appointment type AND
 * the member holds a certificate eligible for at least one non-base service.
 *
 * Eligibility logic mirrors the web portal's bookingEligibility.ts exactly:
 *   - Workout for 1 is always shown (no certificate required).
 *   - All other types require a certificate that covers them.
 *
 * On selection → navigates to SelectDateTime with all required booking params.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcuityLocation {
  id: string;
  name: string;
  calendarId: string;
  appointmentTypeIDs: string[];
}

interface AcuityConfig {
  ownerId: string;
  appointmentTypes: { workoutFor1: string; redLightTherapy: string; freeTrial: string };
  locations: AcuityLocation[];
}

interface MemberCert {
  code: string;
  productName: string;
  remainingValue: string;
  appointmentTypeIDs?: string[];
  appliesToAllProducts?: boolean;
}

interface CertCheckResult {
  valid: boolean;
  productName: string;
  remainingValue: string;
  productIDs: string[];
  appliesToAllProducts: boolean;
}

interface AcuityAppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  description?: string | null;
  category?: string | null;
}

// ── Eligibility ───────────────────────────────────────────────────────────────

function getEligibleTypeIds(
  locationTypeIds: string[],
  workoutFor1Id: string,
  memberCerts: MemberCert[],
  certCheck: CertCheckResult | null,
  certCode: string,
): string[] {
  return locationTypeIds.filter((typeId) => {
    if (typeId === workoutFor1Id) return true;
    if (
      memberCerts.some(
        (c) => c.appliesToAllProducts === true || (c.appointmentTypeIDs ?? []).includes(typeId),
      )
    ) return true;
    if (
      certCode &&
      certCheck &&
      certCheck.valid &&
      (certCheck.appliesToAllProducts || certCheck.productIDs.includes(typeId))
    ) return true;
    return false;
  });
}

const STEPS_WITH_SERVICE = ['Location', 'Service', 'Date & Time', 'Confirm'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectServiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();

  const {
    locationId = '',
    locationName = '',
    certificate = '',
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    calendarId: string;
    certificate: string;
  }>();

  const certCode = (certificate as string).trim();
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // ── Queries (shared queryKeys with index.tsx — instant cache hits) ─────────

  const configQuery = useQuery<AcuityConfig>({
    queryKey: ['acuity-config'],
    enabled: !!isSignedIn,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${baseUrl}/api/booking/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch config');
      return res.json();
    },
  });

  const certsQuery = useQuery<MemberCert[]>({
    queryKey: ['member-certificates'],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${baseUrl}/api/booking/certificates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch certificates');
      return res.json();
    },
  });

  const certCheckQuery = useQuery<CertCheckResult>({
    queryKey: ['cert-check', certCode],
    enabled: !!certCode && !!isSignedIn,
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(
        `${baseUrl}/api/booking/certificates/check?certificate=${encodeURIComponent(certCode)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Invalid certificate');
      return res.json();
    },
  });

  const typesQuery = useQuery<AcuityAppointmentType[]>({
    queryKey: ['appointment-types'],
    enabled: !!isSignedIn,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${baseUrl}/api/booking/appointment-types`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch appointment types');
      return res.json();
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const isLoading = configQuery.isLoading || certsQuery.isLoading || typesQuery.isLoading;

  const acuityConfig   = configQuery.data;
  const memberCerts    = certsQuery.data   ?? [];
  const certCheck      = certCheckQuery.data ?? null;
  const appointmentTypes = typesQuery.data ?? [];

  const locationCfg = acuityConfig?.locations.find((l) => l.id === locationId);

  const eligibleIds =
    acuityConfig && locationCfg
      ? getEligibleTypeIds(
          locationCfg.appointmentTypeIDs,
          acuityConfig.appointmentTypes.workoutFor1,
          memberCerts,
          certCheck,
          certCode,
        )
      : [];

  const eligibleTypes: AcuityAppointmentType[] = eligibleIds
    .map((id) => appointmentTypes.find((t) => String(t.id) === id))
    .filter((t): t is AcuityAppointmentType => !!t);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (type: AcuityAppointmentType) => {
      router.push({
        pathname: '/(tabs)/book/select-datetime',
        params: {
          locationId:          locationId as string,
          locationName:        locationName as string,
          appointmentTypeID:   String(type.id),
          appointmentTypeName: type.name,
          certificate:         certCode,
          from:                'select-service',
        },
      });
    },
    [router, locationId, locationName, certCode],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: 40 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back to Location"
      >
        <SvgIcon name="arrow-left" size={17} color={colors.mutedForeground} />
        <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back to Location</Text>
      </TouchableOpacity>

      {/* Progress */}
      <BookingProgress steps={STEPS_WITH_SERVICE} currentStep="Service" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>CHOOSE YOUR SESSION</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {locationName as string}
        </Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : eligibleTypes.length === 0 ? (
        <View
          style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SvgIcon name="alert-circle" size={20} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No services available. Please check your membership package or contact the studio.
          </Text>
        </View>
      ) : (
        <View style={styles.cards}>
          {eligibleTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              onPress={() => handleSelect(type)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={type.name}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.typeName, { color: colors.foreground }]}>
                  {type.name}
                </Text>

                {!!type.description && (
                  <Text
                    style={[styles.typeDesc, { color: colors.mutedForeground }]}
                    numberOfLines={2}
                  >
                    {type.description}
                  </Text>
                )}

                {!!type.duration && (
                  <View style={styles.durationRow}>
                    <SvgIcon name="clock" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.durationText, { color: colors.mutedForeground }]}>
                      {type.duration} min
                    </Text>
                  </View>
                )}
              </View>

              <SvgIcon name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { paddingHorizontal: 20 },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText:    { fontFamily: 'Inter_500Medium', fontSize: 14 },
  header:      { marginBottom: 24 },
  title:       { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 32, letterSpacing: 2, marginBottom: 4 },
  subtitle:    { fontFamily: 'Inter_400Regular', fontSize: 14 },
  cards:       { gap: 12 },
  card: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardBody:     { flex: 1, gap: 5 },
  typeName:     { fontFamily: 'BarlowCondensed_700Bold', fontSize: 20, letterSpacing: 0.3, lineHeight: 24 },
  typeDesc:     { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  durationRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  durationText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#A6A6A6' },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
  },
  emptyText: { fontFamily: 'Inter_400Regular', flex: 1, fontSize: 14, lineHeight: 20 },
});
