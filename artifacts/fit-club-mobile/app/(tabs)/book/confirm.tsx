import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';

const STEPS_WITH_SERVICE    = ['Location', 'Service', 'Date & Time', 'Confirm'];
const STEPS_WITHOUT_SERVICE = ['Location', 'Date & Time', 'Confirm'];

export default function ConfirmScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const {
    locationId,
    locationName,
    appointmentTypeID,
    appointmentTypeName,
    certificate,
    from,
    date,
    dateDisplay,
    datetime,
    timeDisplay,
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    appointmentTypeID: string;
    appointmentTypeName: string;
    certificate: string;
    from: string;
    date: string;
    dateDisplay: string;
    datetime: string;
    timeDisplay: string;
  }>();

  const steps = from === 'select-service' ? STEPS_WITH_SERVICE : STEPS_WITHOUT_SERVICE;

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const hasCertificate = !!(certificate?.trim());
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');

      const body: Record<string, unknown> = {
        locationId,
        appointmentTypeID,
        datetime,
      };
      if (hasCertificate) body.certificate = certificate;

      const res = await fetch(`${baseUrl}/api/booking/appointments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error ?? 'Could not create appointment. Please try again.');
      }

      const appt = await res.json();

      router.replace({
        pathname: '/(tabs)/book/confirmed',
        params: {
          appointmentId:   String(appt.id ?? ''),
          appointmentType: appt.type ?? appointmentTypeName,
          dateDisplay,
          timeDisplay,
          locationName,
          calendar: appt.calendar ?? locationName,
        },
      });
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to Date & Time"
        >
          <SvgIcon name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>CONFIRM BOOKING</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Review your session details
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <BookingProgress steps={steps} currentStep="Confirm" />

        {/* ── Session summary ──────────────────────────────────── */}
        <View
          style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SummaryRow label="SERVICE"  value={appointmentTypeName ?? ''} colors={colors} />
          <Divider colors={colors} />
          <SummaryRow label="LOCATION" value={locationName ?? ''} colors={colors} />
          <Divider colors={colors} />
          <SummaryRow label="DATE"     value={dateDisplay ?? date ?? ''} colors={colors} />
          <Divider colors={colors} />
          <SummaryRow label="TIME"     value={timeDisplay ?? ''} colors={colors} />
        </View>

        {/* ── Certificate banner ───────────────────────────────── */}
        {hasCertificate && (
          <View
            style={[
              styles.certCard,
              {
                backgroundColor: 'rgba(34,197,94,0.08)',
                borderColor: 'rgba(34,197,94,0.35)',
              },
            ]}
          >
            <View style={styles.certRow}>
              <SvgIcon name="check" size={15} color="#22c55e" />
              <View style={{ flex: 1 }}>
                <Text style={styles.certTitle}>Membership Applied</Text>
                <Text style={[styles.certCode, { color: colors.mutedForeground }]}>
                  Code: {certificate}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Submit error ─────────────────────────────────────── */}
        {submitError ? (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: 'rgba(239,68,68,0.10)',
                borderColor: 'rgba(239,68,68,0.35)',
              },
            ]}
          >
            <SvgIcon name="alert-circle" size={15} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {submitError}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.policyNote, { color: colors.mutedForeground }]}>
          Cancellations within 24 hours of the session may not receive a refund.
        </Text>
      </ScrollView>

      {/* ── Confirm button ──────────────────────────────────────── */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={submitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Confirm Booking"
          style={[
            styles.confirmBtn,
            { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>
              CONFIRM BOOKING
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SummaryRowProps {
  label: string;
  value: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}

function SummaryRow({ label, value, colors }: SummaryRowProps) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[rowStyles.value, { color: colors.foreground }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof import('@/hooks/useColors').useColors> }) {
  return <View style={[dividerStyle.line, { backgroundColor: colors.border }]} />;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
    textAlign: 'right',
  },
});

const dividerStyle = StyleSheet.create({
  line: { height: 1 },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 22,
    letterSpacing: 2,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 16,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  certCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  certTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#22c55e',
  },
  certCode: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    flex: 1,
  },
  policyNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  confirmBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 16,
    letterSpacing: 1.5,
  },
});
