import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/expo';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';

const STEPS_WITH_SERVICE    = ['Location', 'Service', 'Date & Time', 'Confirm'];
const STEPS_WITHOUT_SERVICE = ['Location', 'Date & Time', 'Confirm'];
const CTA_TO_TAB_BAR_GAP = 8;

function usablePhoneNumber(value: unknown): string {
  if (typeof value !== 'string') return '';
  const phone = value.trim();
  const digitCount = phone.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15 ? phone : '';
}

function usableName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

interface BookingRequest {
  locationId: string;
  appointmentTypeID: string;
  datetime: string;
  firstName: string;
  lastName: string;
  phone: string;
  termsAccepted: boolean;
  certificate?: string;
}

export default function ConfirmScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { getToken, sessionClaims } = useAuth();
  const { user } = useUser();

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
  const [bookingFirstName, setBookingFirstName] = useState('');
  const [bookingLastName, setBookingLastName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  const hasCertificate = !!(certificate?.trim());
  const clerkFirstName = usableName(user?.firstName);
  const clerkLastName = usableName(user?.lastName);
  const sessionFirstName = usableName(
    (sessionClaims as Record<string, unknown> | null | undefined)?.first_name,
  );
  const sessionLastName = usableName(
    (sessionClaims as Record<string, unknown> | null | undefined)?.last_name,
  );
  const trustedFirstName = clerkFirstName || sessionFirstName;
  const trustedLastName = clerkLastName || sessionLastName;
  const needsName = !trustedFirstName;
  const clerkPhone = usablePhoneNumber(user?.primaryPhoneNumber?.phoneNumber);
  const sessionPhone = usablePhoneNumber(
    (sessionClaims as Record<string, unknown> | null | undefined)?.phone_number,
  );
  const trustedPhone = clerkPhone || sessionPhone;
  const needsPhone = !trustedPhone;
  const hasBookingPhone = !!usablePhoneNumber(bookingPhone);
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');

      const body: BookingRequest = {
        locationId,
        appointmentTypeID,
        datetime,
        firstName: trustedFirstName || bookingFirstName.trim(),
        lastName: trustedLastName || bookingLastName.trim(),
        phone: trustedPhone || bookingPhone.trim(),
        termsAccepted,
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
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          // The Android tab bar is absolutely positioned by the parent tabs
          // navigator. Bound the whole screen above that navigator-owned
          // region instead of positioning the CTA into it.
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: tabBarHeight + CTA_TO_TAB_BAR_GAP,
          left: 0,
        },
      ]}
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
        // Allow the review region to shrink inside the tab-bar-constrained
        // column so it scrolls instead of pushing the fixed footer downward.
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[
          styles.scrollContent,
          // Measured so the final review and terms content can scroll clear
          // of the sticky confirmation action.
          { paddingBottom: footerHeight + 24 },
        ]}
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

        {needsName ? (
          <View
            style={[
              styles.nameCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.nameTitle, { color: colors.foreground }]}>
              Add your name to complete booking
            </Text>
            <Text style={[styles.nameHint, { color: colors.mutedForeground }]}>
              Your first name is required for the studio reservation.
            </Text>
            <Text style={[styles.nameLabel, { color: colors.mutedForeground }]}>
              FIRST NAME *
            </Text>
            <TextInput
              value={bookingFirstName}
              onChangeText={setBookingFirstName}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              autoComplete="given-name"
              textContentType="givenName"
              style={[
                styles.nameInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              accessibilityLabel="First Name"
            />
            <Text style={[styles.nameLabel, { color: colors.mutedForeground }]}>
              LAST NAME <Text style={styles.optionalLabel}>(OPTIONAL)</Text>
            </Text>
            <TextInput
              value={bookingLastName}
              onChangeText={setBookingLastName}
              placeholder="Last name"
              placeholderTextColor={colors.mutedForeground}
              autoComplete="family-name"
              textContentType="familyName"
              style={[
                styles.nameInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              accessibilityLabel="Last Name"
            />
          </View>
        ) : null}

        {needsPhone ? (
          <View
            style={[
              styles.phoneCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.phoneTitle, { color: colors.foreground }]}>
              Add your phone number to complete booking
            </Text>
            <Text style={[styles.phoneHint, { color: colors.mutedForeground }]}>
              A valid phone number is required for the studio reservation.
            </Text>
            <Text style={[styles.phoneLabel, { color: colors.mutedForeground }]}>
              PHONE NUMBER *
            </Text>
            <TextInput
              value={bookingPhone}
              onChangeText={setBookingPhone}
              placeholder="(555) 555-5555"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              style={[
                styles.phoneInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              accessibilityLabel="Phone Number"
            />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => setTermsAccepted((accepted) => !accepted)}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
          accessibilityLabel="I have read and agree to the Terms and Conditions"
          style={[
            styles.termsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.termsCheckbox,
              {
                backgroundColor: termsAccepted ? colors.primary : colors.background,
                borderColor: termsAccepted ? colors.primary : colors.border,
              },
            ]}
          >
            {termsAccepted ? (
              <SvgIcon name="check" size={14} color={colors.primaryForeground} />
            ) : null}
          </View>
          <Text style={[styles.termsText, { color: colors.foreground }]}>
            I have read and agree to the Terms &amp; Conditions.
          </Text>
        </TouchableOpacity>

        <Text style={[styles.policyNote, { color: colors.mutedForeground }]}>
          Cancellations within 24 hours of the session may not receive a refund.
        </Text>
      </ScrollView>

      {/* ── Confirm button ──────────────────────────────────────── */}
      <View
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          setFooterHeight((height) => (height === nextHeight ? height : nextHeight));
        }}
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={
            submitting ||
            (!trustedFirstName && !bookingFirstName.trim()) ||
            (needsPhone && !hasBookingPhone) ||
            !termsAccepted
          }
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Confirm Booking"
          style={[
            styles.confirmBtn,
            {
              backgroundColor: colors.primary,
              opacity:
                submitting ||
                (!trustedFirstName && !bookingFirstName.trim()) ||
                (needsPhone && !hasBookingPhone) ||
                !termsAccepted
                  ? 0.6
                  : 1,
            },
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
  phoneCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  nameCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  nameTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  nameHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  nameLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 6,
  },
  optionalLabel: {
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  phoneTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  phoneHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  phoneLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 6,
  },
  phoneInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  termsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  policyNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  footer: {
    flexShrink: 0,
    paddingTop: 12,
    paddingBottom: 12,
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
