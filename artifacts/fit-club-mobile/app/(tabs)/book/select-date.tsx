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

// ─── helpers ─────────────────────────────────────────────────────────────────

function toYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toMonthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

function formatDateHeader(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ─── component ───────────────────────────────────────────────────────────────

export default function SelectDateScreen() {
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
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    appointmentTypeID: string;
    appointmentTypeName: string;
    certificate: string;
  }>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Track which month is currently loaded to avoid stale responses.
  const currentMonthKey = useRef('');

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const loadAvailability = useCallback(async (year: number, month: number) => {
    const key = toMonthParam(year, month);
    currentMonthKey.current = key;
    setLoading(true);
    setError('');
    setAvailableDates(new Set());
    setSelectedDate(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const url =
        `${baseUrl}/api/booking/availability/dates` +
        `?locationId=${encodeURIComponent(locationId ?? '')}` +
        `&appointmentTypeID=${encodeURIComponent(appointmentTypeID ?? '')}` +
        `&month=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (currentMonthKey.current !== key) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Could not load availability.');
      }
      const dates: string[] = await res.json();
      if (currentMonthKey.current !== key) return;
      setAvailableDates(new Set(dates));
    } catch (err: any) {
      if (currentMonthKey.current !== key) return;
      setError(err?.message ?? 'Could not load availability.');
    } finally {
      if (currentMonthKey.current === toMonthParam(year, month)) {
        setLoading(false);
      }
    }
  }, [locationId, appointmentTypeID, getToken, baseUrl]);

  useEffect(() => {
    loadAvailability(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  function goToPrevMonth() {
    if (viewYear === today.getFullYear() && viewMonth === today.getMonth()) return;
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  function handleSelectDate(date: Date) {
    const ymd = toYMD(date);
    if (!availableDates.has(ymd)) return;
    setSelectedDate(date);
  }

  function handleContinue() {
    if (!selectedDate) return;
    router.push({
      pathname: '/(tabs)/book/select-time',
      params: {
        locationId,
        locationName,
        appointmentTypeID,
        appointmentTypeName,
        certificate,
        date: toYMD(selectedDate),
        dateDisplay: formatDateHeader(selectedDate),
      },
    });
  }

  // Build calendar grid for view month
  const firstDay = startOfMonth(viewYear, viewMonth).getDay(); // 0=Sun
  const totalDays = daysInMonth(viewYear, viewMonth);
  const isPrevDisabled =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const hasAvailability = !loading && !error && availableDates.size > 0;
  const noAvailability = !loading && !error && availableDates.size === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <SvgIcon name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>SELECT DATE</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {locationName} · {appointmentTypeName}
          </Text>
        </View>
      </View>

      {/* ── Month navigation ───────────────────────────────────── */}
      <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={goToPrevMonth}
          disabled={isPrevDisabled}
          hitSlop={12}
          style={[styles.monthNavBtn, { opacity: isPrevDisabled ? 0.3 : 1 }]}
        >
          <SvgIcon name="chevron-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>
          {formatMonthLabel(viewYear, viewMonth)}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} hitSlop={12} style={styles.monthNavBtn}>
          <SvgIcon name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Day-of-week headers ────────────────────────────────── */}
        <View style={styles.dayHeaders}>
          {DAY_HEADERS.map((d) => (
            <Text key={d} style={[styles.dayHeader, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>

        {/* ── Loading ─────────────────────────────────────────────── */}
        {loading && (
          <View style={styles.stateArea}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Loading availability…
            </Text>
          </View>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {error ? (
          <View style={styles.stateArea}>
            <SvgIcon name="alert-circle" size={32} color={colors.destructive} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => loadAvailability(viewYear, viewMonth)}
              style={[styles.retryBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryBtnText, { color: colors.primary }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Calendar grid ───────────────────────────────────────── */}
        {!loading && !error && (
          <View style={styles.calendarGrid}>
            {/* Empty leading cells for first-day offset */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}

            {Array.from({ length: totalDays }).map((_, i) => {
              const dayNum = i + 1;
              const date = new Date(viewYear, viewMonth, dayNum);
              const ymd = toYMD(date);
              const isPast = ymd < todayYMD;
              const isAvailable = availableDates.has(ymd);
              const isSelected = selectedDate ? toYMD(selectedDate) === ymd : false;
              const isDisabled = isPast || !isAvailable;

              return (
                <TouchableOpacity
                  key={ymd}
                  onPress={() => !isDisabled && handleSelectDate(date)}
                  disabled={isDisabled}
                  activeOpacity={0.75}
                  style={[
                    styles.dayCell,
                    isSelected && {
                      backgroundColor: colors.primary,
                      borderRadius: 12,
                    },
                    !isSelected && isAvailable && {
                      borderWidth: 1.5,
                      borderColor: colors.primary,
                      borderRadius: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isSelected
                        ? { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }
                        : isAvailable
                        ? { color: colors.primary, fontFamily: 'Inter_600SemiBold' }
                        : { color: colors.mutedForeground, opacity: 0.4, fontFamily: 'Inter_400Regular' },
                    ]}
                  >
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── No availability ─────────────────────────────────────── */}
        {noAvailability && (
          <View style={styles.stateArea}>
            <SvgIcon name="calendar" size={32} color={colors.mutedForeground} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              No availability in {formatMonthLabel(viewYear, viewMonth)}.
            </Text>
            <TouchableOpacity onPress={goToNextMonth} hitSlop={8}>
              <Text style={[styles.nextMonthLink, { color: colors.primary }]}>
                Check next month →
              </Text>
            </TouchableOpacity>
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
        {selectedDate && (
          <Text style={[styles.selectedLabel, { color: colors.mutedForeground }]}>
            {formatDateHeader(selectedDate)}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!selectedDate}
          activeOpacity={0.8}
          style={[
            styles.continueBtn,
            { backgroundColor: selectedDate ? colors.primary : colors.card },
          ]}
        >
          <Text
            style={[
              styles.continueBtnText,
              { color: selectedDate ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            SELECT TIME
          </Text>
          <SvgIcon
            name="chevron-right"
            size={18}
            color={selectedDate ? colors.primaryForeground : colors.mutedForeground}
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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  monthNavBtn: {
    padding: 4,
  },
  monthLabel: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 18,
    letterSpacing: 1.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  dayNum: {
    fontSize: 16,
    textAlign: 'center',
  },
  stateArea: {
    alignItems: 'center',
    paddingVertical: 40,
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
  nextMonthLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
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
