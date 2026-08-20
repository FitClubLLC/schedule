import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Pressable,
  TextInput, ActivityIndicator, ScrollView, RefreshControl,
  Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/expo';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgIcon from '@/components/SvgIcon';
import { useCertificate } from '@/hooks/useCertificate';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';

interface MemberCert {
  code: string;
  productName: string;
  remainingValue: string;
  /** Acuity appointment type IDs this certificate is valid for. */
  appointmentTypeIDs?: string[];
  /** When true the certificate applies to all appointment types. */
  appliesToAllProducts?: boolean;
}

interface AcuityAppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  description?: string | null;
  category?: string | null;
}

interface AcuityService {
  key: string;
  appointmentTypeID: string;
  name: string;
  bookingMode: 'native' | 'external';
  calendarId: string;
  requiresCertificate: boolean;
}

interface AcuityConfig {
  ownerId: string;
  appointmentTypes: {
    workoutFor1: string;
    redLightTherapy: string;
    freeTrial: string;
  };
  locations: Array<{
    id: string;
    name: string;
    calendarId: string;
    services: AcuityService[];
    appointmentTypeIDs: string[];
  }>;
}

type DiagnosticSignedInState = true | false | 'undefined';
type DiagnosticTokenState = 'not-requested' | 'pending' | 'obtained' | 'missing' | 'failed';
type DiagnosticRequestState = 'not-started' | 'started' | 'completed' | 'failed';
type DiagnosticOutcome = 'not-finished' | 'completed' | 'failed';

interface BookConfigDiagnostic {
  clerkIsLoaded: boolean;
  isSignedIn: DiagnosticSignedInState;
  configQueryStatus: string;
  configFetchStatus: string;
  tokenStatus: DiagnosticTokenState;
  configRequest: DiagnosticRequestState;
  configOutcome: DiagnosticOutcome;
  elapsedMs: number;
  loadAttempt: number;
}

const BOOK_CONFIG_DIAGNOSTIC_THRESHOLD_MS = 5000;

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const memberEmail = user?.primaryEmailAddress?.emailAddress;
  const { certificate: certParam } = useLocalSearchParams<{ certificate?: string }>();
  const { code, applyCode, clearCode, status, info } = useCertificate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const configLoadStartedAt = useRef<number | null>(null);
  const diagnosticMounted = useRef(true);
  const [showConfigRecovery, setShowConfigRecovery] = useState(false);
  const [configDiagnostic, setConfigDiagnostic] = useState<BookConfigDiagnostic>({
    clerkIsLoaded: false,
    isSignedIn: 'undefined',
    configQueryStatus: 'pending',
    configFetchStatus: 'idle',
    tokenStatus: 'not-requested',
    configRequest: 'not-started',
    configOutcome: 'not-finished',
    elapsedMs: 0,
    loadAttempt: 0,
  });

  const diagnosticRef = useRef(configDiagnostic);

  useEffect(() => {
    return () => {
      diagnosticMounted.current = false;
    };
  }, []);

  const reportConfigDiagnostic = useCallback(
    (
      event: string,
      patch: Partial<BookConfigDiagnostic>,
    ) => {
      const startedAt = configLoadStartedAt.current;
      const next: BookConfigDiagnostic = {
        ...diagnosticRef.current,
        ...patch,
        elapsedMs: startedAt === null ? 0 : Date.now() - startedAt,
      };
      diagnosticRef.current = next;
      if (diagnosticMounted.current) {
        setConfigDiagnostic(next);
      }
      if (__DEV__) {
        console.info('[FitClub BookRoot diagnostic]', event, {
          clerkIsLoaded: next.clerkIsLoaded,
          isSignedIn: next.isSignedIn,
          configQueryStatus: next.configQueryStatus,
          configFetchStatus: next.configFetchStatus,
          tokenStatus: next.tokenStatus,
          configRequest: next.configRequest,
          configOutcome: next.configOutcome,
          elapsedMs: next.elapsedMs,
        });
      }
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['member-certificates'] }),
        queryClient.refetchQueries({ queryKey: ['cert-check'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Auto-refresh certificates when returning from an external browser (Free Trial flow).
  useAppForegroundRefresh([['member-certificates']]);

  const bookingAuthReady = isLoaded && isSignedIn === true;

  const configQuery = useQuery<AcuityConfig>({
    queryKey: ['acuity-config'],
    enabled: bookingAuthReady,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      configLoadStartedAt.current = Date.now();
      const loadAttempt = diagnosticRef.current.loadAttempt + 1;
      reportConfigDiagnostic('config-load-started', {
        clerkIsLoaded: isLoaded,
        isSignedIn: typeof isSignedIn === 'boolean' ? isSignedIn : 'undefined',
        configQueryStatus: 'pending',
        configFetchStatus: 'fetching',
        tokenStatus: 'pending',
        configRequest: 'not-started',
        configOutcome: 'not-finished',
        loadAttempt,
      });

      let requestStarted = false;
      try {
        const token = await getToken();
        reportConfigDiagnostic('clerk-token-resolved', {
          tokenStatus: token ? 'obtained' : 'missing',
        });

        requestStarted = true;
        reportConfigDiagnostic('config-request-started', {
          configRequest: 'started',
        });

        const result = await customFetch<AcuityConfig>('/api/booking/config', {
          method: 'GET',
          responseType: 'json',
          // Use the token already obtained for this existing request so the
          // diagnostic does not create a second auth lookup.
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });

        reportConfigDiagnostic('config-request-completed', {
          configRequest: 'completed',
          configOutcome: 'completed',
        });
        return result;
      } catch (error) {
        reportConfigDiagnostic('config-request-failed', {
          tokenStatus:
            diagnosticRef.current.tokenStatus === 'pending'
              ? 'failed'
              : diagnosticRef.current.tokenStatus,
          configRequest: requestStarted ? 'failed' : 'not-started',
          configOutcome: 'failed',
        });
        throw error;
      }
    },
  });

  const certsQuery = useQuery<MemberCert[]>({
    queryKey: ['member-certificates'],
    enabled: bookingAuthReady,
    queryFn: () => customFetch<MemberCert[]>('/api/booking/certificates', {
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

  const memberCerts: MemberCert[] = certsQuery.data ?? [];
  const appointmentTypes: AcuityAppointmentType[] = typesQuery.data ?? [];
  const acuityConfig = configQuery.data;

  useEffect(() => {
    reportConfigDiagnostic('query-state-changed', {
      clerkIsLoaded: isLoaded,
      isSignedIn: typeof isSignedIn === 'boolean' ? isSignedIn : 'undefined',
      configQueryStatus: configQuery.status,
      configFetchStatus: configQuery.fetchStatus,
    });
  }, [
    configQuery.fetchStatus,
    configQuery.status,
    isLoaded,
    isSignedIn,
    reportConfigDiagnostic,
  ]);

  useEffect(() => {
    if (!configQuery.isLoading || configLoadStartedAt.current === null) {
      setShowConfigRecovery(false);
      return;
    }

    const startedAt = configLoadStartedAt.current;
    const remainingMs = Math.max(
      0,
      BOOK_CONFIG_DIAGNOSTIC_THRESHOLD_MS - (Date.now() - startedAt),
    );
    const timeout = setTimeout(() => {
      setShowConfigRecovery(true);
      reportConfigDiagnostic('config-load-threshold-reached', {});
    }, remainingMs);

    return () => clearTimeout(timeout);
  }, [configDiagnostic.loadAttempt, configQuery.isLoading, reportConfigDiagnostic]);

  useEffect(() => {
    if (certParam?.trim()) {
      applyCode(certParam.trim());
    }
  }, [certParam, applyCode]);

  const handleBook = (loc: AcuityConfig['locations'][number]) => {
    if (!acuityConfig) return;

    // All locations expose at least Free Trial (external) + Workout for 1 (native),
    // so always route through the service selector. SelectService handles
    // external vs native branching and per-member eligibility filtering.
    router.push({
      pathname: '/(tabs)/book/select-service',
      params: {
        locationId:   loc.id,
        locationName: loc.name,
        certificate:  status === 'valid' ? code : '',
      },
    });
  };

  const certBannerBg =
    status === 'valid'
      ? 'rgba(34,197,94,0.12)'
      : status === 'invalid'
      ? 'rgba(239,68,68,0.10)'
      : colors.card;
  const certBannerBorder =
    status === 'valid'
      ? 'rgba(34,197,94,0.45)'
      : status === 'invalid'
      ? 'rgba(239,68,68,0.40)'
      : colors.border;
  const certIconColor =
    status === 'valid' ? '#22c55e' : status === 'invalid' ? '#ef4444' : colors.mutedForeground;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>BOOK A SESSION</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Where would you like to train?
        </Text>
      </View>

      {/* ── Location cards — PRIMARY ───────────────────────────────── */}
      <View style={styles.locationCards}>
        {showConfigRecovery && configQuery.isLoading && (
          <View
            style={[
              styles.diagnosticBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.diagnosticTitle, { color: colors.foreground }]}>
              BOOK IS STILL LOADING
            </Text>
            <Text style={[styles.diagnosticText, { color: colors.mutedForeground }]}>
              Diagnostic: auth {configDiagnostic.clerkIsLoaded ? 'ready' : 'not ready'} · signed in{' '}
              {String(configDiagnostic.isSignedIn)} · token {configDiagnostic.tokenStatus} · config{' '}
              {configDiagnostic.configRequest} · query {configDiagnostic.configQueryStatus}/
              {configDiagnostic.configFetchStatus} · {configDiagnostic.elapsedMs}ms
            </Text>
            <Text style={[styles.diagnosticText, { color: colors.mutedForeground }]}>
              Please capture the Expo Go console output before leaving this screen.
            </Text>
          </View>
        )}
        {configQuery.isLoading
          ? [1, 2].map((i) => (
              <View
                key={i}
                style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border, minHeight: 88 }]}
              >
                <ActivityIndicator color={colors.primary} />
              </View>
            ))
          : (acuityConfig?.locations ?? []).map((loc) => {
              const serviceNames = loc.services.map((s) => {
                const meta = appointmentTypes.find((t) => String(t.id) === s.appointmentTypeID);
                return meta?.name ?? s.name;
              });

              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => handleBook(loc)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Book at ${loc.name}`}
                  style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.locationCardBody}>
                    <Text style={[styles.locationName, { color: colors.foreground }]}>
                      {loc.name}
                    </Text>
                    {serviceNames.length > 0 && (
                      <Text
                        style={[styles.locationServices, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {serviceNames.join(' · ')}
                      </Text>
                    )}
                    {status === 'valid' && (
                      <View style={styles.appliedRow}>
                        <SvgIcon name="check" size={11} color="#22c55e" />
                        <Text style={styles.appliedText}>Package applied</Text>
                      </View>
                    )}
                  </View>
                  <SvgIcon
                    name="chevron-right"
                    size={18}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              );
            })}
      </View>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Your packages — SECONDARY ─────────────────────────────── */}
      {(certsQuery.isLoading || memberCerts.length > 0) && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            YOUR PACKAGES
          </Text>

          {certsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 4 }} />
          ) : (
            <View style={styles.packagesList}>
              {memberCerts.map((cert) => {
                const isActive = code === cert.code && status === 'valid';
                return (
                  <TouchableOpacity
                    key={cert.code}
                    onPress={() => (isActive ? clearCode() : applyCode(cert.code))}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${cert.productName}${isActive ? ', applied' : ', tap to use'}`}
                    style={[
                      styles.packageCard,
                      {
                        backgroundColor: isActive
                          ? 'rgba(34,197,94,0.10)'
                          : colors.card,
                        borderColor: isActive
                          ? 'rgba(34,197,94,0.45)'
                          : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.packageCardLeft}>
                      <View
                        style={[
                          styles.packageIconWrap,
                          { backgroundColor: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(211,175,55,0.10)' },
                        ]}
                      >
                        <SvgIcon
                          name={isActive ? 'check' : 'credit-card'}
                          size={15}
                          color={isActive ? '#22c55e' : colors.primary}
                        />
                      </View>
                      <View style={styles.packageInfo}>
                        <Text
                          style={[styles.packageName, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {cert.productName}
                        </Text>
                        <Text style={[styles.packageValue, { color: colors.mutedForeground }]}>
                          {cert.remainingValue.includes('session')
                            ? `${cert.remainingValue} remaining`
                            : `$${cert.remainingValue} remaining`}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.packageAction,
                        { color: isActive ? '#22c55e' : colors.mutedForeground },
                      ]}
                    >
                      {isActive ? 'Applied ✓' : 'Use'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ── Certificate code section ──────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {memberCerts.length > 0 ? 'OR ENTER A CODE MANUALLY' : 'MEMBERSHIP / PACKAGE CODE'}
        </Text>

        <View
          style={[
            styles.certInputRow,
            {
              backgroundColor: colors.card,
              borderColor: code ? certBannerBorder : colors.border,
            },
          ]}
        >
          <SvgIcon name="credit-card" size={17} color={certIconColor} />
          <TextInput
            style={[styles.certInput, { color: colors.foreground }]}
            placeholder="Enter certificate code"
            placeholderTextColor={colors.mutedForeground}
            value={code}
            onChangeText={applyCode}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Membership or package certificate code"
          />
          {status === 'checking' && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          {code.length > 0 && status !== 'checking' && (
            <TouchableOpacity
              onPress={clearCode}
              hitSlop={10}
              accessibilityLabel="Clear certificate code"
            >
              <SvgIcon name="x" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {status === 'valid' && info && (
          <View style={[styles.certBanner, { backgroundColor: certBannerBg, borderColor: certBannerBorder }]}>
            <SvgIcon name="check" size={14} color="#22c55e" />
            <Text style={[styles.certBannerText, { color: '#22c55e' }]}>
              {info.productName}
              {(() => {
                const matchedCert = memberCerts.find((c) => c.code === code);
                const rv = matchedCert?.remainingValue ?? info.remainingValue;
                return rv && rv !== '0.00'
                  ? ` · ${rv.includes('session') ? '' : '$'}${rv} remaining`
                  : '';
              })()}
              {' '}— applied to booking
            </Text>
          </View>
        )}
        {status === 'invalid' && code.length > 0 && (
          <View style={[styles.certBanner, { backgroundColor: certBannerBg, borderColor: certBannerBorder }]}>
            <SvgIcon name="alert-circle" size={14} color="#ef4444" />
            <Text style={[styles.certBannerText, { color: '#ef4444' }]}>
              Invalid or expired certificate code
            </Text>
          </View>
        )}
      </View>

      {/* ── Free Trial — small text link at bottom ────────────────── */}
      <TouchableOpacity
        onPress={() => {
          if (!acuityConfig) return;
          WebBrowser.openBrowserAsync(
            `https://app.acuityscheduling.com/schedule.php?owner=${acuityConfig.ownerId}&appointmentType=${acuityConfig.appointmentTypes.freeTrial}${memberEmail ? `&email=${encodeURIComponent(memberEmail)}` : ''}`,
            { dismissButtonStyle: 'close', toolbarColor: '#000000', controlsColor: '#D3AF37' },
          );
        }}
        activeOpacity={0.7}
        disabled={!acuityConfig}
        accessibilityRole="link"
        accessibilityLabel="Book a free trial"
        style={[styles.trialLink, { opacity: acuityConfig ? 1 : 0.4 }]}
      >
        <Text style={[styles.trialLinkText, { color: colors.mutedForeground }]}>
          New to Fit Club?{' '}
          <Text style={[styles.trialLinkCta, { color: colors.primary }]}>
            Book a free trial
          </Text>
        </Text>
        <SvgIcon name="external-link" size={12} color={colors.primary} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 34,
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },

  // Location cards
  locationCards: {
    gap: 12,
    marginBottom: 28,
  },
  diagnosticBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  diagnosticTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  diagnosticText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
  },
  locationCardBody: {
    flex: 1,
    gap: 4,
  },
  locationName: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    letterSpacing: 0.5,
    lineHeight: 26,
  },
  locationServices: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  appliedText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#22c55e',
  },

  // Divider
  divider: {
    height: 1,
    marginBottom: 24,
  },

  // Sections
  section: {
    marginBottom: 24,
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
  },

  // Packages
  packagesList: {
    gap: 8,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  packageCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  packageIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageInfo: {
    flex: 1,
    gap: 2,
  },
  packageName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  packageValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  packageAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginLeft: 8,
  },

  // Certificate input
  certInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  certInput: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 1.5,
    padding: 0,
  },
  certBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  certBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flex: 1,
  },

  // Free trial text link
  trialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  trialLinkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  trialLinkCta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
