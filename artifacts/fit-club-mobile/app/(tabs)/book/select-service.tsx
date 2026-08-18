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
 * On selection → navigates to SelectDate with all required booking params.
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

// ── Types (mirrors backend shapes) ────────────────────────────────────────────

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
//
// Mirrors web portal's src/lib/bookingEligibility.ts — keep in sync if rules change.

function getEligibleTypeIds(
  locationTypeIds: string[],
  workoutFor1Id: string,
  memberCerts: MemberCert[],
  certCheck: CertCheckResult | null,
  certCode: string,
): string[] {
  return locationTypeIds.filter((typeId) => {
    // 1. Workout for 1 — always shown, no certificate required.
    if (typeId === workoutFor1Id) return true;

    // 2a. Member has an account certificate that covers this type.
    if (
      memberCerts.some(
        (c) => c.appliesToAllProducts === true || (c.appointmentTypeIDs ?? []).includes(typeId),
      )
    ) return true;

    // 2b. Member entered a code manually and the check result covers this type.
    if (
      certCode &&
      certCheck &&
      certCheck.valid &&
      (certCheck.appliesToAllProducts || certCheck.productIDs.includes(typeId))
    ) return true;

    return false;
  });
}

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

  // ── Queries (all share queryKeys with index.tsx — cached hits are instant) ──

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

  // ── Derived state ─────────────────────────────────────────────────────────

  const isLoading =
    configQuery.isLoading || certsQuery.isLoading || typesQuery.isLoading;

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

  // Match eligible IDs against the full type metadata list.
  const eligibleTypes: AcuityAppointmentType[] = eligibleIds
    .map((id) => appointmentTypes.find((t) => String(t.id) === id))
    .filter((t): t is AcuityAppointmentType => !!t);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (type: AcuityAppointmentType) => {
      router.push({
        pathname: '/(tabs)/book/select-date',
        params: {
          locationId:          locationId as string,
          locationName:        locationName as string,
          appointmentTypeID:   String(type.id),
          appointmentTypeName: type.name,
          certificate:         certCode,
        },
      });
    },
    [router, locationId, locationName, certCode],
  );

  // ── Render ────────────────────────────────────────────────────────────────

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
      >
        <SvgIcon name="arrow-left" size={18} color={colors.mutedForeground} />
        <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Choose a Service</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {locationName} — select the service you&apos;d like to book.
        </Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 32 }}
        />
      ) : eligibleTypes.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
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
              style={[
                styles.card,
                {
                  backgroundColor: 'rgba(211,175,55,0.08)',
                  borderColor: 'rgba(211,175,55,0.45)',
                },
              ]}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.typeName, { color: '#D3AF37' }]}>
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
                    <SvgIcon name="clock" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.durationText, { color: colors.mutedForeground }]}>
                      {type.duration} min
                    </Text>
                  </View>
                )}
              </View>

              <View style={[styles.selectBtn, { backgroundColor: '#D3AF37' }]}>
                <Text style={styles.selectBtnText}>Select</Text>
              </View>
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
  backText:    { fontSize: 14, fontWeight: '500' },
  header:      { marginBottom: 24 },
  title:       { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 6 },
  subtitle:    { fontSize: 15, lineHeight: 22 },
  cards:       { gap: 14 },
  card: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardBody:    { flex: 1, gap: 6 },
  typeName:    { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  typeDesc:    { fontSize: 13, lineHeight: 18 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  durationText:{ fontSize: 13 },
  selectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  selectBtnText: { fontSize: 14, fontWeight: '700', color: '#0D0D0D' },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
  },
  emptyText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
