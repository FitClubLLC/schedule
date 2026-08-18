import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface TimeSlot {
  time: string;
  datetime: string;
}

function formatTimeLabel(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function SelectTimeScreen() {
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
    date,
    dateDisplay,
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    appointmentTypeID: string;
    appointmentTypeName: string;
    certificate: string;
    date: string;
    dateDisplay: string;
  }>();

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const currentDateKey = useRef('');
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const loadTimes = useCallback(async () => {
    if (!date) return;
    const key = date;
    currentDateKey.current = key;
    setLoading(true);
    setError('');
    setSlots([]);
    setSelectedSlot(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const url =
        `${baseUrl}/api/booking/availability/times` +
        `?locationId=${encodeURIComponent(locationId ?? '')}` +
        `&appointmentTypeID=${encodeURIComponent(appointmentTypeID ?? '')}` +
        `&date=${encodeURIComponent(date ?? '')}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (currentDateKey.current !== key) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Could not load times.');
      }
      const data: Array<{ time: string }> = await res.json();
      if (currentDateKey.current !== key) return;
      // Acuity's /availability/times returns [{ time: "ISO_DATETIME" }].
      // Map t.time to both slots so selectedSlot.datetime is always a valid ISO string.
      setSlots(data.map((t) => ({ time: t.time, datetime: t.time })));
    } catch (err: any) {
      if (currentDateKey.current !== key) return;
      setError(err?.message ?? 'Could not load available times.');
    } finally {
      if (currentDateKey.current === date) setLoading(false);
    }
  }, [locationId, appointmentTypeID, date, getToken, baseUrl]);

  useEffect(() => {
    loadTimes();
  }, [loadTimes]);

  function handleContinue() {
    if (!selectedSlot) return;
    router.push({
      pathname: '/(tabs)/book/confirm',
      params: {
        locationId,
        locationName,
        appointmentTypeID,
        appointmentTypeName,
        certificate,
        date,
        dateDisplay,
        datetime: selectedSlot.datetime,
        timeDisplay: formatTimeLabel(selectedSlot.time),
      },
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <SvgIcon name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>SELECT TIME</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {dateDisplay} · {locationName}
          </Text>
        </View>
      </View>

      {/* ── Content ────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          AVAILABLE TIMES
        </Text>

        {loading && (
          <View style={styles.stateArea}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Loading times…
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.stateArea}>
            <SvgIcon name="alert-circle" size={32} color={colors.destructive} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{error}</Text>
            <TouchableOpacity
              onPress={loadTimes}
              style={[styles.retryBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryBtnText, { color: colors.primary }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && slots.length === 0 && (
          <View style={styles.stateArea}>
            <SvgIcon name="calendar" size={32} color={colors.mutedForeground} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              No times available on this date.
            </Text>
            <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
              <Text style={[styles.backLink, { color: colors.primary }]}>← Pick another date</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && slots.length > 0 && (
          <View style={styles.slotGrid}>
            {slots.map((slot, i) => {
              const isSelected = slot.datetime === selectedSlot?.datetime;
              return (
                <TouchableOpacity
                  key={`${slot.datetime}-${i}`}
                  onPress={() => setSelectedSlot(slot)}
                  activeOpacity={0.8}
                  style={[
                    styles.slotPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.slotText,
                      { color: isSelected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {formatTimeLabel(slot.time)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Continue button ─────────────────────────────────────── */}
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
        {selectedSlot && (
          <Text style={[styles.selectedLabel, { color: colors.mutedForeground }]}>
            {formatTimeLabel(selectedSlot.time)}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!selectedSlot}
          activeOpacity={0.8}
          style={[
            styles.continueBtn,
            { backgroundColor: selectedSlot ? colors.primary : colors.card },
          ]}
        >
          <Text
            style={[
              styles.continueBtnText,
              { color: selectedSlot ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            REVIEW BOOKING
          </Text>
          <SvgIcon
            name="chevron-right"
            size={18}
            color={selectedSlot ? colors.primaryForeground : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
    paddingTop: 20,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  stateArea: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  stateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  backLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotPill: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 100,
    alignItems: 'center',
  },
  slotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    gap: 8,
  },
  selectedLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueBtnText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 16,
    letterSpacing: 1.5,
  },
});
