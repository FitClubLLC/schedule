import React, { useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert,
  TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
    color: '#4A9EFF',
    colorMuted: 'rgba(74,158,255,0.13)',
    colorBorder: 'rgba(74,158,255,0.4)',
  },
];

function acuityUrl(calendarId: string, certificate?: string) {
  let url = `https://app.acuityscheduling.com/schedule.php?owner=${OWNER_ID}&calendarID=${calendarId}`;
  if (certificate?.trim()) {
    url += `&certificate=${encodeURIComponent(certificate.trim())}`;
  }
  return url;
}

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { certificate: certParam } = useLocalSearchParams<{ certificate?: string }>();
  const { code, applyCode, clearCode, status, info } = useCertificate();

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

      {/* Certificate code section */}
      <View style={styles.certSection}>
        <Text style={[styles.certLabel, { color: colors.mutedForeground }]}>
          MEMBERSHIP / PACKAGE CODE
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
                ? ` · $${info.remainingValue} remaining`
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

      {/* Location cards */}
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
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: loc.colorMuted }]}>
              <SvgIcon name="map-pin" size={22} color={loc.color} />
            </View>

            {/* Text */}
            <View style={styles.cardBody}>
              <Text style={[styles.locName, { color: loc.color }]}>{loc.name}</Text>
              <Text style={[styles.locSub, { color: colors.textMuted }]}>
                View availability &amp; book a session
              </Text>
            </View>

            {/* Button — shows "Code Applied" badge when a valid cert is present */}
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

  // Certificate section
  certSection: {
    marginBottom: 24,
    gap: 8,
  },
  certLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
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
