/**
 * SelectService — mobile service-selection step.
 *
 * Shown for every location. Services are sourced from the API config:
 *   - External services (Free Trial) open the Acuity hosted scheduler.
 *   - Native services (Workout for 1, Red Light Therapy) are always shown.
 *
 * All native services are presented regardless of certificate status.
 * Certificate/package eligibility is enforced server-side at appointment
 * creation (POST /booking/appointments → 422), so members see every option
 * and receive a clear error only when they are actually ineligible.
 * Red Light Therapy is Kentlands-only (calendar 14464905); Potomac never
 * includes it in its service list.
 */

import React, { useCallback, useState } from 'react';
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
import { useAuth, useUser } from '@clerk/expo';
import {
  customFetch,
  getAcuitySchedulerUrl,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';
import { MEMBER_CERTIFICATES_QUERY_KEY } from '@/lib/membershipRefresh';
import {
  getWorkoutBookingAction,
  isWorkoutBookingActionUnavailable,
  WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE,
  type MobileMemberCertificate,
} from '@/lib/membershipPresentation';

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

interface AcuityAppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  description?: string | null;
  category?: string | null;
}

interface CertificateCheckResult {
  valid: boolean;
  productName: string;
  remainingValue: string;
  productIDs: string[];
  appliesToAllProducts: boolean;
}

const STEPS = ['Location', 'Service', 'Date & Time', 'Confirm'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectServiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bookingBottomClearance = insets.bottom + 96;
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [selectionMessage, setSelectionMessage] = useState('');

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

  const typesQuery = useQuery<AcuityAppointmentType[]>({
    queryKey: ['appointment-types'],
    enabled: bookingAuthReady,
    staleTime: 10 * 60 * 1000,
    queryFn: () => customFetch<AcuityAppointmentType[]>('/api/booking/appointment-types', {
      method: 'GET',
      responseType: 'json',
    }),
  });
  const certificatesQuery = useQuery<MobileMemberCertificate[]>({
    queryKey: MEMBER_CERTIFICATES_QUERY_KEY,
    enabled: bookingAuthReady,
    queryFn: () => customFetch<MobileMemberCertificate[]>('/api/booking/certificates', {
      method: 'GET',
      responseType: 'json',
    }),
  });
  const selectedCertificateQuery = useQuery<CertificateCheckResult>({
    queryKey: ['cert-check', certCode],
    enabled: bookingAuthReady && !!certCode,
    queryFn: () => customFetch<CertificateCheckResult>(
      `/api/booking/certificates/check?certificate=${encodeURIComponent(certCode)}`,
      { method: 'GET', responseType: 'json' },
    ),
    retry: false,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const isLoading =
    configQuery.isLoading ||
    typesQuery.isLoading ||
    certificatesQuery.isLoading ||
    (!!certCode && selectedCertificateQuery.isLoading);

  const acuityConfig     = configQuery.data;
  const appointmentTypes = typesQuery.data   ?? [];
  const memberCertificates = certificatesQuery.data ?? [];

  const locationCfg = acuityConfig?.locations.find((l) => l.id === locationId);
  const selectedCertificate =
    selectedCertificateQuery.data && certCode
      ? [{
          code: certCode,
          productName: selectedCertificateQuery.data.productName,
          remainingValue: selectedCertificateQuery.data.remainingValue,
          appointmentTypeIDs: selectedCertificateQuery.data.productIDs,
          appliesToAllProducts: selectedCertificateQuery.data.appliesToAllProducts,
        }]
      : [];
  const certificates = [
    ...memberCertificates,
    ...selectedCertificate.filter(
      (selected) => !memberCertificates.some((certificate) => certificate.code === selected.code),
    ),
  ];
  const workoutAction = acuityConfig
    ? getWorkoutBookingAction({
        packageIsLoading: certificatesQuery.isLoading,
        packageIsError: certificatesQuery.isError,
        selectedCertificateIsLoading: !!certCode && selectedCertificateQuery.isLoading,
        selectedCertificateIsError: !!certCode && selectedCertificateQuery.isError,
        certificates,
        workoutAppointmentTypeId: acuityConfig.appointmentTypes.workoutFor1,
        selectedCertificateCode: certCode,
      })
    : { kind: 'hosted-payment' as const };

  // Build the visible service list: all services in config order.
  // External services (Free Trial) open the Acuity hosted scheduler.
  // Native services are always shown — the server enforces eligibility at
  // appointment-creation time (POST /booking/appointments → 422) so members
  // see every option and receive a clear error only if they are ineligible.
  const visibleServices: Array<AcuityService & { meta?: AcuityAppointmentType }> = [];

  if (locationCfg) {
    for (const service of locationCfg.services) {
      const meta =
        service.bookingMode === 'native'
          ? appointmentTypes.find((t) => String(t.id) === service.appointmentTypeID)
          : undefined;
      visibleServices.push({ ...service, meta });
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (service: AcuityService & { meta?: AcuityAppointmentType }) => {
      setSelectionMessage('');
      if (service.bookingMode === 'external') {
        const url = getAcuitySchedulerUrl({
          ownerId: acuityConfig?.ownerId ?? '',
          appointmentTypeId: service.appointmentTypeID,
          calendarId: service.calendarId,
          email: user?.primaryEmailAddress?.emailAddress,
        });
        WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
        return;
      }

      const isWorkoutFor1 =
        service.appointmentTypeID === acuityConfig?.appointmentTypes.workoutFor1;
      if (isWorkoutFor1) {
        if (workoutAction.kind === 'error') {
          setSelectionMessage('We couldn’t verify your packages. Please retry before continuing.');
          return;
        }
        if (workoutAction.kind === 'loading') {
          return;
        }
        if (workoutAction.kind === 'choose-credit') {
          setSelectionMessage(WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE);
          return;
        }
        if (workoutAction.kind === 'hosted-payment') {
          const url = getAcuitySchedulerUrl({
            ownerId: acuityConfig?.ownerId ?? '',
            appointmentTypeId: service.appointmentTypeID,
            calendarId: service.calendarId,
            email: user?.primaryEmailAddress?.emailAddress,
          });
          WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
          return;
        }
      }

      router.push({
        pathname: '/(tabs)/book/select-datetime',
        params: {
          locationId:          locationId as string,
          locationName:        locationName as string,
          appointmentTypeID:   service.appointmentTypeID,
          appointmentTypeName: service.meta?.name ?? service.name,
            certificate:         isWorkoutFor1 && workoutAction.kind === 'native'
             ? workoutAction.certificateCode
            : certCode,
          from:                'select-service',
        },
      });
    },
    [
      router,
      locationId,
      locationName,
      certCode,
      acuityConfig,
      user?.primaryEmailAddress?.emailAddress,
      certificatesQuery.isError,
      selectedCertificateQuery.isLoading,
      workoutAction,
    ],
  );

  const retryQueries = () => {
    setSelectionMessage('');
    void Promise.all([
      configQuery.refetch(),
      typesQuery.refetch(),
      certificatesQuery.refetch(),
      certCode ? selectedCertificateQuery.refetch() : Promise.resolve(),
    ]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + 16,
          // The classic Android tab bar is absolute, so keep the last
          // service card scrollable above it and the system safe area.
          paddingBottom: bookingBottomClearance,
        },
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
          {selectionMessage ? (
            <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SvgIcon name="alert-circle" size={18} color={colors.mutedForeground} />
              <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
                {selectionMessage}
              </Text>
            </View>
          ) : null}
          {workoutAction.kind === 'choose-credit' ? (
            <View
              testID="workout-choose-membership-message"
              style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <SvgIcon name="info" size={18} color={colors.mutedForeground} />
              <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
                {WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE}
              </Text>
            </View>
          ) : null}
          {workoutAction.kind === 'error' ? (
            <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SvgIcon name="wifi-off" size={18} color={colors.mutedForeground} />
              <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
                We couldn’t load your package eligibility.
              </Text>
              <TouchableOpacity
                onPress={retryQueries}
                accessibilityRole="button"
                accessibilityLabel="Retry package eligibility"
              >
                <Text style={[styles.retryText, { color: colors.primary }]}>RETRY</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {visibleServices.map((service) => {
            const displayName = service.meta?.name ?? service.name;
            const description = service.meta?.description ?? null;
            const duration    = service.meta?.duration;
            const isExternal  = service.bookingMode === 'external';
            const isWorkoutFor1 =
              service.appointmentTypeID === acuityConfig?.appointmentTypes.workoutFor1;
            const isHostedWorkout =
              isWorkoutFor1 && workoutAction.kind === 'hosted-payment';
            const isHosted = isExternal || isHostedWorkout;
            const isUnavailable =
              isWorkoutFor1 && isWorkoutBookingActionUnavailable(workoutAction);

            return (
              <TouchableOpacity
                key={service.key}
                testID={isWorkoutFor1 ? 'workout-for-1-service' : undefined}
                onPress={() => handleSelect(service)}
                activeOpacity={0.75}
                disabled={isUnavailable}
                accessibilityRole="button"
                accessibilityLabel={displayName}
                accessibilityHint={
                  isUnavailable && workoutAction.kind === 'choose-credit'
                    ? WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE
                    : undefined
                }
                accessibilityState={{ disabled: isUnavailable }}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isExternal && styles.cardExternal,
                  isUnavailable && styles.cardUnavailable,
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

                  {isHosted ? (
                    <View style={styles.durationRow}>
                      <SvgIcon name="external-link" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.durationText, { color: colors.mutedForeground }]}>
                        {isHostedWorkout ? 'Secure payment in Acuity' : 'External booking'}
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
                  name={
                    isUnavailable
                      ? 'info'
                      : isHosted
                        ? 'external-link'
                        : 'chevron-right'
                  }
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
  messageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  messageText: { fontFamily: 'Inter_400Regular', flex: 1, fontSize: 13, lineHeight: 19 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1 },
  cardUnavailable: { opacity: 0.62 },
});
