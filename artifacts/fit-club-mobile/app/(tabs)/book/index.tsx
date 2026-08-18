import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  TextInput, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgIcon from '@/components/SvgIcon';
import { useCertificate } from '@/hooks/useCertificate';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';

interface MemberCert {
  code: string;
  productName: string;
  remainingValue: string;
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
  }>;
}

const LOCATION_COLOR = '#D3AF37';
const LOCATION_COLOR_MUTED = 'rgba(211,175,55,0.18)';
const LOCATION_COLOR_BORDER = 'rgba(211,175,55,0.5)';

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const memberEmail = user?.primaryEmailAddress?.emailAddress;
  const { certificate: certParam } = useLocalSearchParams<{ certificate?: string }>();
  const { code, applyCode, clearCode, status, info } = useCertificate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

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

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // Fetch Acuity config (owner ID, appointment type IDs, location calendar IDs)
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
      if (!res.ok) throw new Error('Failed to fetch booking config');
      return res.json();
    },
  });

  // Fetch member's active certificates from Acuity
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

  const memberCerts: MemberCert[] = certsQuery.data ?? [];
  const acuityConfig = configQuery.data;

  // Auto-apply certificate from deep link / navigation param
  useEffect(() => {
    if (certParam?.trim()) {
      applyCode(certParam.trim());
    }
  }, [certParam]);

  // Navigate into the native booking flow for the selected location.
  // Acuity is called behind the scenes via POST /api/booking/appointments —
  // the member never sees Acuity's hosted scheduling UI.
  const handleBook = (locationId: string, _calendarId: string, locationName: string) => {
    if (!acuityConfig) return;

    // Default to Workout for 1 for both locations.
    // Red Light Therapy (Kentlands-only) will be selectable once
    // the service-selector step is added in a future iteration.
    const appointmentTypeID = acuityConfig.appointmentTypes.workoutFor1;
    const appointmentTypeName = 'Workout for 1';

    router.push({
      pathname: '/(tabs)/book/select-date',
      params: {
        locationId,
        locationName,
        appointmentTypeID,
        appointmentTypeName,
        // Pass an empty string rather than undefined — Expo Router serialises
        // params as strings, so the confirm screen checks `certificate.trim()`.
        certificate: status === 'valid' ? code : '',
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
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: 32 }]}
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Book a Session</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Choose your preferred location to view availability and book.
        </Text>
      </View>

      {/* ── Free trial CTA ───────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.trialBtn, { borderColor: colors.primary, opacity: acuityConfig ? 1 : 0.5 }]}
        activeOpacity={0.75}
        onPress={() => {
          if (!acuityConfig) return;
          WebBrowser.openBrowserAsync(
            `https://app.acuityscheduling.com/schedule.php?owner=${acuityConfig.ownerId}&appointmentType=${acuityConfig.appointmentTypes.freeTrial}${memberEmail ? `&email=${encodeURIComponent(memberEmail)}` : ''}`,
            { dismissButtonStyle: 'close', toolbarColor: '#000000', controlsColor: '#D3AF37' },
          );
        }}
      >
        {configQuery.isLoading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <SvgIcon name="plus-circle" size={18} color={colors.primary} />}
        <Text style={[styles.trialBtnText, { color: colors.primary }]}>Book a Free Trial</Text>
        <SvgIcon name="external-link" size={14} color={colors.primary} />
      </TouchableOpacity>

      {/* ── Your memberships section ──────────────────────────────── */}
      {(certsQuery.isLoading || memberCerts.length > 0) && (
        <View style={styles.packagesSection}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            YOUR MEMBERSHIPS
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
                    onPress={() => isActive ? clearCode() : applyCode(cert.code)}
                    activeOpacity={0.75}
                    style={[
                      styles.packageCard,
                      {
                        backgroundColor: isActive
                          ? 'rgba(34,197,94,0.10)'
                          : LOCATION_COLOR_MUTED,
                        borderColor: isActive
                          ? 'rgba(34,197,94,0.45)'
                          : LOCATION_COLOR_BORDER,
                      },
                    ]}
                  >
                    <View style={styles.packageCardLeft}>
                      <View style={[
                        styles.packageIconWrap,
                        { backgroundColor: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(211,175,55,0.12)' },
                      ]}>
                        <SvgIcon
                          name={isActive ? 'check' : 'credit-card'}
                          size={16}
                          color={isActive ? '#22c55e' : colors.primary}
                        />
                      </View>
                      <View style={styles.packageInfo}>
                        <Text style={[styles.packageName, { color: isActive ? colors.foreground : LOCATION_COLOR }]} numberOfLines={1}>
                          {cert.productName}
                        </Text>
                        <Text style={[styles.packageValue, { color: colors.mutedForeground }]}>
                          {cert.remainingValue.includes('session')
                            ? `${cert.remainingValue} remaining`
                            : `$${cert.remainingValue} remaining`}
                        </Text>
                      </View>
                    </View>
                    <Text style={[
                      styles.packageAction,
                      { color: isActive ? '#22c55e' : colors.primary },
                    ]}>
                      {isActive ? 'Applied ✓' : 'Tap to Use'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ── Certificate code section ──────────────────────────────── */}
      <View style={styles.certSection}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {memberCerts.length > 0 ? 'OR ENTER A CODE MANUALLY' : 'MEMBERSHIP CODE'}
        </Text>

        {/* Input row */}
        <View style={[
          styles.certInputRow,
          { backgroundColor: colors.card, borderColor: code ? certBannerBorder : colors.border },
        ]}>
          <SvgIcon name="credit-card" size={18} color={certIconColor} />
          <TextInput
            style={[styles.certInput, { color: colors.foreground }]}
            placeholder="Enter membership code"
            placeholderTextColor={colors.mutedForeground}
            value={code}
            onChangeText={applyCode}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
          />
          {status === 'checking' && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          {code.length > 0 && status !== 'checking' && (
            <TouchableOpacity onPress={clearCode} hitSlop={8}>
              <SvgIcon name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status banner */}
        {status === 'valid' && info && (
          <View style={[styles.certBanner, { backgroundColor: certBannerBg, borderColor: certBannerBorder }]}>
            <SvgIcon name="check" size={15} color="#22c55e" />
            <Text style={[styles.certBannerText, { color: '#22c55e' }]}>
              {info.productName}
              {(() => {
                const matchedCert = memberCerts.find(c => c.code === code);
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
            <SvgIcon name="alert-circle" size={15} color="#ef4444" />
            <Text style={[styles.certBannerText, { color: '#ef4444' }]}>
              Invalid or expired membership code
            </Text>
          </View>
        )}
      </View>

      {/* ── Location cards ────────────────────────────────────────── */}
      <View style={styles.cards}>
        {configQuery.isLoading
          ? [1, 2].map((i) => (
              <View
                key={i}
                style={[styles.card, { backgroundColor: LOCATION_COLOR_MUTED, borderColor: LOCATION_COLOR_BORDER, minHeight: 160 }]}
              >
                <ActivityIndicator color={LOCATION_COLOR} />
              </View>
            ))
          : (acuityConfig?.locations ?? []).map((loc) => (
          <TouchableOpacity
            key={loc.id}
            onPress={() => handleBook(loc.id, loc.calendarId, loc.name)}
            activeOpacity={0.75}
            style={[
              styles.card,
              {
                backgroundColor: LOCATION_COLOR_MUTED,
                borderColor: LOCATION_COLOR_BORDER,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: LOCATION_COLOR_MUTED }]}>
              <SvgIcon name="map-pin" size={22} color={LOCATION_COLOR} />
            </View>

            <View style={styles.cardBody}>
              <Text style={[styles.locName, { color: LOCATION_COLOR }]}>{loc.name}</Text>
              <Text style={[styles.locSub, { color: colors.mutedForeground }]}>
                View availability &amp; book a session
              </Text>
            </View>

            <View style={styles.btnRow}>
              <View style={[styles.btn, { backgroundColor: LOCATION_COLOR }]}>
                <Text style={styles.btnText}>Book Now</Text>
              </View>
              {status === 'valid' && (
                <View style={styles.certBadge}>
                  <SvgIcon name="check" size={11} color="#22c55e" />
                  <Text style={styles.certBadgeText}>Code applied</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },

  // Free trial button
  trialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    borderStyle: 'dashed',
    paddingVertical: 14,
    marginBottom: 20,
  },
  trialBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Packages section
  packagesSection: {
    marginBottom: 24,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
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
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageInfo: {
    flex: 1,
    gap: 2,
  },
  packageName: {
    fontSize: 14,
    fontWeight: '700',
  },
  packageValue: {
    fontSize: 12,
  },
  packageAction: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },

  // Certificate code section
  certSection: {
    marginBottom: 24,
    gap: 8,
  },
  certInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  certInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Location cards
  cards: {
    gap: 16,
  },
  card: {
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 24,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    gap: 4,
  },
  locName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  locSub: {
    fontSize: 15,
    fontWeight: '500',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  certBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
});
