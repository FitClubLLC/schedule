/**
 * SelectDateTime — merged date + time selection screen.
 *
 * Replaces the previous two-screen flow (select-date → select-time) with a
 * single scrollable screen that matches the web redesign:
 *
 *   1. Compact progress indicator
 *   2. "CHOOSE YOUR TIME" heading + context line (Location · Service)
 *   3. Custom calendar (month nav + grid) with existing availability API
 *   4. Time slots grouped by Morning / Afternoon / Evening
 *   5. Sticky bottom CTA:
 *        no selection → "SELECT A TIME TO CONTINUE"
 *        selected     → "CONTINUE · Thu, Aug 20 at 2:30 PM"
 *
 * ALL business logic (availability hooks, API calls, stale-slot invalidation,
 * timezone handling, exact Acuity datetime values) is preserved from the
 * original select-date.tsx and select-time.tsx.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BookingProgress } from '@/components/book/BookingProgress';
import { formatStudioTime, studioHour } from '@/lib/studioTime';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatDateFull(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatDateCompact(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTimeLabel(isoStr: string): string {
  return formatStudioTime(isoStr);
}

function getHour(isoStr: string): number {
  return studioHour(isoStr);
}

interface TimeSlot {
  time: string;   // ISO datetime from Acuity
  datetime: string; // same value — used as the booking target
}

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const STEPS_WITH_SERVICE  = ['Location', 'Service', 'Date & Time', 'Confirm'];
const STEPS_WITHOUT_SERVICE = ['Location', 'Date & Time', 'Confirm'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectDateTimeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bookingBottomClearance = insets.bottom + 96;
  const router = useRouter();
  const { getToken } = useAuth();

  const {
    locationId,
    locationName,
    appointmentTypeID,
    appointmentTypeName,
    certificate,
    from,
  } = useLocalSearchParams<{
    locationId: string;
    locationName: string;
    appointmentTypeID: string;
    appointmentTypeName: string;
    certificate: string;
    from: string;
  }>();

  const steps = from === 'select-service' ? STEPS_WITH_SERVICE : STEPS_WITHOUT_SERVICE;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYMD = toYMD(today);

  // ── Calendar state ────────────────────────────────────────────────────────

  const [viewYear, setViewYear]           = useState(today.getFullYear());
  const [viewMonth, setViewMonth]         = useState(today.getMonth());
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [datesLoading, setDatesLoading]   = useState(false);
  const [datesError, setDatesError]       = useState('');
  const [selectedDate, setSelectedDate]   = useState<Date | null>(null);

  // ── Time state ────────────────────────────────────────────────────────────

  const [slots, setSlots]               = useState<TimeSlot[]>([]);
  const [timesLoading, setTimesLoading] = useState(false);
  const [timesError, setTimesError]     = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  const currentMonthKey = useRef('');
  const currentDateKey  = useRef('');
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  // ── Load available dates for a given month ────────────────────────────────

  const loadDates = useCallback(async (year: number, month: number) => {
    const key = toMonthParam(year, month);
    currentMonthKey.current = key;
    setDatesLoading(true);
    setDatesError('');
    setAvailableDates(new Set());
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const url =
        `${baseUrl}/api/booking/availability/dates` +
        `?locationId=${encodeURIComponent(locationId ?? '')}` +
        `&appointmentTypeID=${encodeURIComponent(appointmentTypeID ?? '')}` +
        `&month=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
      setDatesError(err?.message ?? 'Could not load availability.');
    } finally {
      if (currentMonthKey.current === toMonthParam(year, month)) setDatesLoading(false);
    }
  }, [locationId, appointmentTypeID, getToken, baseUrl]);

  // ── Load available times for a given date ────────────────────────────────

  const loadTimes = useCallback(async (dateYMD: string) => {
    if (!dateYMD) return;
    currentDateKey.current = dateYMD;
    setTimesLoading(true);
    setTimesError('');
    setSlots([]);
    setSelectedSlot(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const url =
        `${baseUrl}/api/booking/availability/times` +
        `?locationId=${encodeURIComponent(locationId ?? '')}` +
        `&appointmentTypeID=${encodeURIComponent(appointmentTypeID ?? '')}` +
        `&date=${encodeURIComponent(dateYMD)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (currentDateKey.current !== dateYMD) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Could not load times.');
      }
      const data: Array<{ time: string }> = await res.json();
      if (currentDateKey.current !== dateYMD) return;
      setSlots(data.map((t) => ({ time: t.time, datetime: t.time })));
    } catch (err: any) {
      if (currentDateKey.current !== dateYMD) return;
      setTimesError(err?.message ?? 'Could not load available times.');
    } finally {
      if (currentDateKey.current === dateYMD) setTimesLoading(false);
    }
  }, [locationId, appointmentTypeID, getToken, baseUrl]);

  // Load dates on mount + month change
  useEffect(() => {
    loadDates(viewYear, viewMonth);
  }, [viewYear, viewMonth]);

  // Load times whenever selected date changes
  useEffect(() => {
    if (selectedDate) loadTimes(toYMD(selectedDate));
  }, [selectedDate]);

  // Stale-slot invalidation: when the member returns from Confirm via back,
  // re-fetch times and clear the selection if the slot no longer exists.
  useFocusEffect(
    useCallback(() => {
      if (!selectedDate || !selectedSlot) return;
      const dateYMD = toYMD(selectedDate);
      (async () => {
        try {
          const token = await getToken();
          if (!token) return;
          const url =
            `${baseUrl}/api/booking/availability/times` +
            `?locationId=${encodeURIComponent(locationId ?? '')}` +
            `&appointmentTypeID=${encodeURIComponent(appointmentTypeID ?? '')}` +
            `&date=${encodeURIComponent(dateYMD)}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return;
          const data: Array<{ time: string }> = await res.json();
          const fresh = data.map((t) => ({ time: t.time, datetime: t.time }));
          setSlots(fresh);
          // If the previously selected slot is gone, clear it
          const stillAvailable = fresh.some((s) => s.datetime === selectedSlot.datetime);
          if (!stillAvailable) setSelectedSlot(null);
        } catch {
          // Silent — don't disrupt the UI on background revalidation
        }
      })();
    }, [selectedDate, selectedSlot, locationId, appointmentTypeID, getToken, baseUrl]),
  );

  // ── Month navigation ───────────────────────────────────────────────────────

  function goToPrevMonth() {
    if (viewYear === today.getFullYear() && viewMonth === today.getMonth()) return;
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function goToNextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSelectDate(date: Date) {
    const ymd = toYMD(date);
    if (!availableDates.has(ymd)) return;
    setSelectedDate(date);
  }

  function handleContinue() {
    if (!selectedDate || !selectedSlot) return;
    router.push({
      pathname: '/(tabs)/book/confirm',
      params: {
        locationId,
        locationName,
        appointmentTypeID,
        appointmentTypeName,
        certificate,
        from,
        date:        toYMD(selectedDate),
        dateDisplay: formatDateFull(selectedDate),
        datetime:    selectedSlot.datetime,
        timeDisplay: formatTimeLabel(selectedSlot.time),
      },
    });
  }

  // ── CTA label ─────────────────────────────────────────────────────────────

  const ctaLabel =
    selectedDate && selectedSlot
      ? `CONTINUE · ${formatDateCompact(selectedDate)} at ${formatTimeLabel(selectedSlot.time)}`
      : 'SELECT A TIME TO CONTINUE';

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const firstDay   = startOfMonth(viewYear, viewMonth).getDay();
  const totalDays  = daysInMonth(viewYear, viewMonth);
  const isPrevDisabled = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // ── Time slot groups ───────────────────────────────────────────────────────

  const morningSlots   = slots.filter((s) => getHour(s.time) < 12);
  const afternoonSlots = slots.filter((s) => getHour(s.time) >= 12 && getHour(s.time) < 17);
  const eveningSlots   = slots.filter((s) => getHour(s.time) >= 17);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          // Safe-area-based clearance keeps booking content and the CTA
          // above the native tab region.
          marginBottom: bookingBottomClearance,
        },
      ]}
    >
      {/* ── Fixed top bar ────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={from === 'select-service' ? 'Back to Service' : 'Back to Location'}
        >
          <SvgIcon name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.topBarText}>
          <Text style={[styles.topBarTitle, { color: colors.foreground }]}>
            CHOOSE YOUR TIME
          </Text>
          <Text style={[styles.topBarSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {locationName}{appointmentTypeName ? ` · ${appointmentTypeName}` : ''}
          </Text>
        </View>
      </View>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          // Measured so the final time slot always clears the sticky CTA.
          { paddingBottom: footerHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <BookingProgress steps={steps} currentStep="Date & Time" />

        {/* ── Month navigation ──────────────────────────────────── */}
        <View style={[styles.monthNav, { borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={goToPrevMonth}
            disabled={isPrevDisabled}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={{ opacity: isPrevDisabled ? 0.3 : 1 }}
          >
            <SvgIcon name="chevron-left" size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {formatMonthLabel(viewYear, viewMonth)}
          </Text>
          <TouchableOpacity
            onPress={goToNextMonth}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <SvgIcon name="chevron-right" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Day-of-week headers ───────────────────────────────── */}
        <View style={styles.dayHeaders}>
          {DAY_HEADERS.map((d) => (
            <Text key={d} style={[styles.dayHeader, { color: colors.mutedForeground }]}>
              {d}
            </Text>
          ))}
        </View>

        {/* ── Loading ───────────────────────────────────────────── */}
        {datesLoading && (
          <View style={styles.stateArea}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Loading availability…
            </Text>
          </View>
        )}

        {/* ── Dates error ───────────────────────────────────────── */}
        {datesError ? (
          <View style={styles.stateArea}>
            <SvgIcon name="alert-circle" size={28} color={colors.destructive} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{datesError}</Text>
            <TouchableOpacity
              onPress={() => loadDates(viewYear, viewMonth)}
              style={[styles.retryBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.retryBtnText, { color: colors.primary }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Calendar grid ─────────────────────────────────────── */}
        {!datesLoading && !datesError && (
          <View style={styles.calendarGrid}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}

            {Array.from({ length: totalDays }).map((_, i) => {
              const dayNum = i + 1;
              const date   = new Date(viewYear, viewMonth, dayNum);
              const ymd    = toYMD(date);
              const isPast      = ymd < todayYMD;
              const isAvailable = availableDates.has(ymd);
              const isSelected  = selectedDate ? toYMD(selectedDate) === ymd : false;
              const isDisabled  = isPast || !isAvailable;

              return (
                <TouchableOpacity
                  key={ymd}
                  onPress={() => !isDisabled && handleSelectDate(date)}
                  disabled={isDisabled}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                  accessibilityLabel={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${isAvailable ? '' : ', unavailable'}`}
                  style={[
                    styles.dayCell,
                    isSelected && {
                      backgroundColor: colors.primary,
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
                        ? { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }
                        : { color: colors.mutedForeground, opacity: 0.35, fontFamily: 'Inter_400Regular' },
                    ]}
                  >
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── No availability ───────────────────────────────────── */}
        {!datesLoading && !datesError && availableDates.size === 0 && (
          <View style={styles.stateArea}>
            <SvgIcon name="calendar" size={28} color={colors.mutedForeground} />
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

        {/* ── AVAILABLE TIMES section ───────────────────────────── */}
        {selectedDate && (
          <>
            <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              AVAILABLE TIMES
            </Text>

            {/* Date context */}
            <Text style={[styles.selectedDateLabel, { color: colors.foreground }]}>
              {formatDateFull(selectedDate)}
            </Text>

            {/* Times loading */}
            {timesLoading && (
              <View style={[styles.stateArea, { paddingVertical: 28 }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {/* Times error */}
            {timesError ? (
              <View style={styles.stateArea}>
                <SvgIcon name="alert-circle" size={24} color={colors.destructive} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{timesError}</Text>
                <TouchableOpacity
                  onPress={() => loadTimes(toYMD(selectedDate))}
                  style={[styles.retryBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.retryBtnText, { color: colors.primary }]}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* No times */}
            {!timesLoading && !timesError && slots.length === 0 && (
              <View style={[styles.stateArea, { paddingVertical: 24 }]}>
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  No times available. Try another date.
                </Text>
              </View>
            )}

            {/* Time slot groups */}
            {!timesLoading && !timesError && slots.length > 0 && (
              <View style={styles.slotGroups}>
                {[
                  { label: 'Morning',   group: morningSlots },
                  { label: 'Afternoon', group: afternoonSlots },
                  { label: 'Evening',   group: eveningSlots },
                ]
                  .filter(({ group }) => group.length > 0)
                  .map(({ label, group }) => (
                    <View key={label} style={styles.slotGroup}>
                      <Text style={[styles.slotGroupLabel, { color: colors.mutedForeground }]}>
                        {label.toUpperCase()}
                      </Text>
                      <View style={styles.slotRow}>
                        {group.map((slot, i) => {
                          const isSelected = slot.datetime === selectedSlot?.datetime;
                          return (
                            <TouchableOpacity
                              key={`${slot.datetime}-${i}`}
                              onPress={() => setSelectedSlot(slot)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                              accessibilityLabel={formatTimeLabel(slot.time)}
                              style={[
                                styles.slotBtn,
                                {
                                  backgroundColor: isSelected ? colors.primary : colors.card,
                                  borderColor: isSelected ? colors.primary : colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.slotText,
                                  {
                                    color: isSelected
                                      ? colors.primaryForeground
                                      : colors.foreground,
                                  },
                                ]}
                              >
                                {formatTimeLabel(slot.time)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Sticky CTA ──────────────────────────────────────────── */}
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
          onPress={handleContinue}
          disabled={!selectedSlot}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          accessibilityState={{ disabled: !selectedSlot }}
          style={[
            styles.ctaBtn,
            {
              backgroundColor: selectedSlot ? colors.primary : colors.card,
              borderColor: selectedSlot ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              { color: selectedSlot ? colors.primaryForeground : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {ctaLabel}
          </Text>
          {selectedSlot && (
            <SvgIcon name="chevron-right" size={18} color={colors.primaryForeground} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  topBarText: {
    flex: 1,
  },
  topBarTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 22,
    letterSpacing: 2,
  },
  topBarSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 1,
  },

  // Scrollable area
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Month navigation
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  monthLabel: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 17,
    letterSpacing: 1.2,
  },

  // Calendar
  dayHeaders: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 4,
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
    marginBottom: 8,
  },
  dayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  dayNum: {
    fontSize: 15,
    textAlign: 'center',
  },

  // State areas
  stateArea: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
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

  // Divider
  sectionDivider: {
    height: 1,
    marginVertical: 20,
    marginHorizontal: -20,
  },

  // Times section
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  selectedDateLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    marginBottom: 16,
  },
  slotGroups: {
    gap: 18,
  },
  slotGroup: {
    gap: 10,
  },
  slotGroupLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 96,
    alignItems: 'center',
  },
  slotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },

  // Sticky footer
  footer: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  ctaText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 15,
    letterSpacing: 1.2,
  },
});
