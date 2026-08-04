import React, { useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert,
  TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgIcon from '@/components/SvgIcon';
import { useCertificate } from '@/hooks/useCertificate';

const OWNER_ID = '36930698';

const LOCATIONS = [
  {
    id: '1',
    name: 'POTOMAC',
    calendarId: '12741713',
    color: '#D3AF37',
    colorMuted: 'rgba(211,175,55,0.13)',
    colorBorder: 'rgba(211,175,55,0.4)',
  },
  {
    id: '2',
    name: 'KENTLANDS',
    calendarId: '14311114',
    color: '#D3AF37',
    colorMuted: 'rgba(211,175,55,0.13)',
    colorBorder: 'rgba(211,175,55,0.4)',
  },
];

interface MemberCert {
  code: string;
  productName: string;
  remainingValue: string;
}

// When a certificate is active, Potomac restricts to Workout for 1 only;
// Kentlands shows all types (Workout for 1 + Red Light Therapy).
const POTOMAC_MEMBER_TYPE = '83398355';

function acuityUrl(calendarId: string, certificate?: string) {
  const cert = certificate?.trim();
  const base = `https://app.acuityscheduling.com/schedule.php?owner=${OWNER_ID}&calendarID=${calendarId}`;
  if (!cert) return base;
  const withCert = `${base}&certificate=${encodeURIComponent(cert)}`;
  // Potomac: restrict to Workout for 1 only
  if (calendarId === '12741713') return `${withCert}&appointmentType=${POTOMAC_MEMBER_TYPE}`;
  // Kentlands: Workout for 1 + Red Light Therapy
  return `${withCert}&appointmentType[]=${POTOMAC_MEMBER_TYPE}&appointmentType[]=96690076`;
}

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken, isSignedIn } = useAuth();
  const { certificate: certParam } = useLocalSearchParams<{ certificate?: string }>();
  const { code, applyCode, clearCode, status, info } = useCertificate();

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // Fetch member's active certificates from Acuity
  const certsQuery = useQuery<MemberCert[]>({
    queryKey: ['member-certificates'],
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/api/booking/certificates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch certificates');
      return res.json();
    },
  });

  const memberCerts: MemberCert[] = certsQuery.data ?? [];

  // Auto-apply certificate from deep link / navigation param
  useEffect(() => {
    if (certParam?.trim()) {
      applyCode(certParam.trim());
    }
  }, [certParam]);

  const handleBook = async (calendarId: string, name: string) => {
    const url = acuityUrl(calendarId, status === 'valid' ? code : undefined);
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', `Unable to open booking page for ${name}.`);
    }
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
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Book a Session</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Choose your preferred location to view availability and book.
        </Text>
      </View>

      {/* ── Free trial CTA ───────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.trialBtn, { borderColor: colors.primary }]}
        activeOpacity={0.75}
        onPress={() => Linking.openURL('https://app.acuityscheduling.com/schedule.php?owner=36930698&appointmentType=83397899')}
      >
        <SvgIcon name="plus-circle" size={18} color={colors.primary} />
        <Text style={[styles.trialBtnText, { color: colors.primary }]}>Book a Free Trial</Text>
        <SvgIcon name="external-link" size={14} color={colors.primary} />
      </TouchableOpacity>

      {/* ── Your packages section ─────────────────────────────────── */}
      {(certsQuery.isLoading || memberCerts.length > 0) && (
        <View style={styles.packagesSection}>
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
                    onPress={() => isActive ? clearCode() : applyCode(cert.code)}
                    activeOpacity={0.75}
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
                      <View style={[
                        styles.packageIconWrap,
                        { backgroundColor: isActive ? 'rgba(34,197,94,0.15)' : colors.background },
                      ]}>
                        <SvgIcon
                          name={isActive ? 'check' : 'credit-card'}
                          size={16}
                          color={isActive ? '#22c55e' : colors.primary}
                        />
                      </View>
                      <View style={styles.packageInfo}>
                        <Text style={[styles.packageName, { color: colors.foreground }]} numberOfLines={1}>
                          {cert.productName}
                        </Text>
                        <Text style={[styles.packageValue, { color: colors.mutedForeground }]}>
                          {/^\d/.test(cert.remainingValue)
                            ? `${cert.remainingValue} remaining`
                            : `$${cert.remainingValue} remaining`}
                        </Text>
                      </View>
                    </View>
                    <Text style={[
                      styles.packageAction,
                      { color: isActive ? '#22c55e' : colors.primary },
                    ]}>
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
      <View style={styles.certSection}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {memberCerts.length > 0 ? 'OR ENTER A CODE MANUALLY' : 'MEMBERSHIP / PACKAGE CODE'}
        </Text>

        {/* Input row */}
        <View style={[
          styles.certInputRow,
          { backgroundColor: colors.card, borderColor: code ? certBannerBorder : colors.border },
        ]}>
          <SvgIcon name="credit-card" size={18} color={certIconColor} />
          <TextInput
            style={[styles.certInput, { color: colors.foreground }]}
            placeholder="Enter certificate code"
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
              {info.remainingValue && info.remainingValue !== '0.00'
                ? ` · ${/^\d/.test(info.remainingValue) ? '' : '$'}${info.remainingValue} remaining`
                : ''}
              {' '}— applied to booking
            </Text>
          </View>
        )}
        {status === 'invalid' && code.length > 0 && (
          <View style={[styles.certBanner, { backgroundColor: certBannerBg, borderColor: certBannerBorder }]}>
            <SvgIcon name="alert-circle" size={15} color="#ef4444" />
            <Text style={[styles.certBannerText, { color: '#ef4444' }]}>
              Invalid or expired certificate code
            </Text>
          </View>
        )}
      </View>

      {/* ── Location cards ────────────────────────────────────────── */}
      <View style={styles.cards}>
        {LOCATIONS.map((loc) => (
          <TouchableOpacity
            key={loc.id}
            onPress={() => handleBook(loc.calendarId, loc.name)}
            activeOpacity={0.75}
            style={[
              styles.card,
              {
                backgroundColor: loc.colorMuted,
                borderColor: loc.colorBorder,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: loc.colorMuted }]}>
              <SvgIcon name="map-pin" size={22} color={loc.color} />
            </View>

            <View style={styles.cardBody}>
              <Text style={[styles.locName, { color: loc.color }]}>{loc.name}</Text>
              <Text style={[styles.locSub, { color: colors.textMuted }]}>
                View availability &amp; book a session
              </Text>
            </View>

            <View style={styles.btnRow}>
              <View style={[styles.btn, { backgroundColor: loc.color }]}>
                <Text style={styles.btnText}>Book Now</Text>
                <SvgIcon name="external-link" size={14} color="#000" />
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
    fontSize: 14,
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
