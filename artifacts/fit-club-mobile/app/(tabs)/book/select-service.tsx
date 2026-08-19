/**
 * SelectService — mobile service-selection step.
 *
 * Shown for every location. Services are sourced from the API config:
 *   - External services (Free Trial) open the Acuity hosted scheduler.
 *   - Native services (Workout for 1, Red Light Therapy) continue through
 *     the native availability → confirm flow.
 *
 * Eligibility logic for native services mirrors the web portal exactly:
 *   - Workout for 1 is always shown (no certificate required).
 *   - All other native types require a certificate that covers them.
 *
 * External services are always shown regardless of certificate status.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { customFetch } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcuityService {
  key: string;
  appointmentTypeID: string;
  name: string;
  bookingMode: 'native' | 'external';
  calendarId: string;
  requiresCertificate: boolean;
}

interface AcuityLocation {
  id: string;
  name: string;
  calendarId: string;
  services: AcuityService[];
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

// ── Eligibility — native services only ───────────────────────────────────────
// External services are shown unconditionally; this filter applies only to
// the native subset.

function isNativeServiceEligible(
  typeId: string,
  workoutFor1Id: string,
  memberCerts: MemberCert[],
  certCheck: CertCheckResult | null,
  certCode: string,
): boolean {
  if (typeId === workoutFor1Id) return true;
  if (
    memberCerts.some(
      (c) => c.appliesToAllProducts === true || (c.appointmentTypeIDs ?? []).includes(typeId),
    )
  ) return true;
  if (
    certCode &&
    certCheck?.valid &&
    (certCheck.appliesToAllProducts || certCheck.productIDs.includes(typeId))
  ) return true;
  return false;
}

const STEPS = ['Location', 'Service', 'Date & Time', 'Confirm'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectServiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const {
    locationId = '',
    locationName = '',
    certificate = '',
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    certificate: string;
  }>();

  const certCode = (certificate as string).trim();
  const bookingAuthReady = isLoaded && isSignedIn === true;

  // ── Queries (shared queryKeys with index.tsx — instant cache hits) ─────────

  const configQuery = useQuery<AcuityConfig>({
    queryKey: ['acuity-config'],
    enabled: bookingAuthReady,
    staleTime: 10 * 60 * 1000,
    queryFn: () => customFetch<AcuityConfig>('/api/booking/config', {
      method: 'GET',
      responseType: 'json',
    }),
  });

  const certsQuery = useQuery<MemberCert[]>({
    queryKey: ['member-certificates'],
    enabled: bookingAuthReady,
    queryFn: () => customFetch<MemberCert[]>('/api/booking/certificates', {
      method: 'GET',
      responseType: 'json',
    }),
  });

  const certCheckQuery = useQuery<CertCheckResult>({
    queryKey: ['cert-check', certCode],
    enabled: !!certCode && bookingAuthReady,
    retry: false,
    queryFn: () =>
      customFetch<CertCheckResult>(
        `/api/booking/certificates/check?certificate=${encodeURIComponent(certCode)}`,
        { method: 'GET', responseType: 'json' },
      ),
  });

  const typesQuery = useQuery<AcuityAppointmentType[]>({
    queryKey: ['appointment-types'],
    enabled: bookingAuthReady,
    staleTime: 10 * 60 * 1000,
    queryFn: () => customFetch<AcuityAppointmentType[]>('/api/booking/appointment-types', {
      method: 'GET',
      responseType: 'json',
    }),
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const isLoading = configQuery.isLoading || certsQuery.isLoading || typesQuery.isLoading;

  const acuityConfig     = configQuery.data;
  const memberCerts      = certsQuery.data   ?? [];
  const certCheck        = certCheckQuery.data ?? null;
  const appointmentTypes = typesQuery.data   ?? [];

  const locationCfg = acuityConfig?.locations.find((l) => l.id === locationId);

  // Build the visible service list in two passes:
  //   1. External services — always shown first.
  //   2. Native services — filtered by certificate eligibility.
  const visibleServices: Array<AcuityService & { meta?: AcuityAppointmentType }> = [];

  if (locationCfg && acuityConfig) {
    for (const service of locationCfg.services) {
      if (service.bookingMode === 'external') {
        visibleServices.push({ ...service, meta: undefined });
      } else {
        if (
          isNativeServiceEligible(
            service.appointmentTypeID,
            acuityConfig.appointmentTypes.workoutFor1,
            memberCerts,
            certCheck,
            certCode,
          )
        ) {
          const meta = appointmentTypes.find((t) => String(t.id) === service.appointmentTypeID);
          visibleServices.push({ ...service, meta });
        }
      }
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (service: AcuityService & { meta?: AcuityAppointmentType }) => {
      if (service.bookingMode === 'external') {
        // Build the Acuity hosted scheduler URL with owner + type + calendar.
        const query = new URLSearchParams({
          owner:           acuityConfig?.ownerId ?? '',
          appointmentType: service.appointmentTypeID,
          calendarID:      service.calendarId,
        });
        const url = `https://app.acuityscheduling.com/schedule.php?${query.toString()}`;
        WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
        return;
      }

      router.push({
        pathname: '/(tabs)/book/select-datetime',
        params: {
          locationId:          locationId as string,
          locationName:        locationName as string,
          appointmentTypeID:   service.appointmentTypeID,
          appointmentTypeName: service.meta?.name ?? service.name,
          certificate:         certCode,
          from:                'select-service',
        },
      });
    },
    [router, locationId, locationName, certCode, acuityConfig],
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
      <BookingProgress steps={STEPS} currentStep="Service" />

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
      ) : visibleServices.length === 0 ? (
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
          {visibleServices.map((service) => {
            const displayName = service.meta?.name ?? service.name;
            const description = service.meta?.description ?? null;
            const duration    = service.meta?.duration;
            const isExternal  = service.bookingMode === 'external';

            return (
              <TouchableOpacity
                key={service.key}
                onPress={() => handleSelect(service)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={displayName}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isExternal && styles.cardExternal,
                ]}
              >
                <View style={styles.cardBody}>
                  <Text style={[styles.typeName, { color: colors.foreground }]}>
                    {displayName}
                  </Text>

                  {!!description && (
                    <Text
                      style={[styles.typeDesc, { color: colors.mutedForeground }]}
                      numberOfLines={2}
                    >
                      {description}
                    </Text>
                  )}

                  {isExternal ? (
                    <View style={styles.durationRow}>
                      <SvgIcon name="external-link" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.durationText, { color: colors.mutedForeground }]}>
                        External booking
                      </Text>
                    </View>
                  ) : !!duration ? (
                    <View style={styles.durationRow}>
                      <SvgIcon name="clock" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.durationText, { color: colors.mutedForeground }]}>
                        {duration} min
                      </Text>
                    </View>
                  ) : null}
                </View>

                <SvgIcon
                  name={isExternal ? 'external-link' : 'chevron-right'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { paddingHorizontal: 20 },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText:      { fontFamily: 'Inter_500Medium', fontSize: 14 },
  header:        { marginBottom: 24 },
  title:         { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 32, letterSpacing: 2, marginBottom: 4 },
  subtitle:      { fontFamily: 'Inter_400Regular', fontSize: 14 },
  cards:         { gap: 12 },
  card: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardExternal:  { opacity: 0.92 },
  cardBody:      { flex: 1, gap: 5 },
  typeName:      { fontFamily: 'BarlowCondensed_700Bold', fontSize: 20, letterSpacing: 0.3, lineHeight: 24 },
  typeDesc:      { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  durationRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  durationText:  { fontFamily: 'Inter_400Regular', fontSize: 13 },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
  },
  emptyText:    { fontFamily: 'Inter_400Regular', flex: 1, fontSize: 14, lineHeight: 20 },
});
