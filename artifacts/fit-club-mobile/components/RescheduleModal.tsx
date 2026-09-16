import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { useAppointmentActions, TimeSlot } from '@/hooks/useAppointmentActions';
import { buildMonthGrid } from '@/lib/calendarGrid';
import { formatStudioTime, studioDateKey } from '@/lib/studioTime';

function toYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toMonthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();
}

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface Props {
  visible: boolean;
  appointmentId: number;
  appointmentType: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleModal({
  visible,
  appointmentId,
  appointmentType,
  onClose,
  onSuccess,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    fetchAvailableDates,
    fetchAvailableTimes,
    rescheduleAppointment,
  } = useAppointmentActions();

  const todayYMD = studioDateKey();
  const [currentYear, currentMonth] = todayYMD.split('-').map(Number);
  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth - 1);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError, setDatesError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Tracks the date key of the most-recently-started request so stale
  // responses from earlier taps are silently discarded (race condition guard).
  const currentDateKey = React.useRef<string>('');
  const currentMonthKey = React.useRef<string>('');

  const loadDates = useCallback(async (year: number, month: number) => {
    const key = toMonthParam(year, month);
    currentMonthKey.current = key;
    currentDateKey.current = '';
    setDatesLoading(true);
    setDatesError('');
    setAvailableDates(new Set());
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError('');
    try {
      const result = await fetchAvailableDates(appointmentId, key);
      if (currentMonthKey.current !== key) return;
      setAvailableDates(new Set(result ?? []));
    } catch (err: any) {
      if (currentMonthKey.current !== key) return;
      setDatesError(err?.message ?? 'Could not load available dates.');
    } finally {
      if (currentMonthKey.current === key) setDatesLoading(false);
    }
  }, [appointmentId]);

  const loadSlots = useCallback(async (date: Date) => {
    const key = toYMD(date);
    currentDateKey.current = key;
    setLoadingSlots(true);
    setSlotsError('');
    setSlots([]);
    setSelectedSlot(null);
    try {
      const result = await fetchAvailableTimes(appointmentId, key);
      // Ignore the response if the user already tapped a different date.
      if (currentDateKey.current !== key) return;
      setSlots(result ?? []);
    } catch (err: any) {
      if (currentDateKey.current !== key) return;
      setSlotsError(err?.message ?? 'Could not load available times.');
    } finally {
      if (currentDateKey.current === key) setLoadingSlots(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (visible) {
      setViewYear(currentYear);
      setViewMonth(currentMonth - 1);
      setSubmitError('');
      void loadDates(currentYear, currentMonth - 1);
    }
  }, [visible]);

  function handleSelectDate(date: Date) {
    if (!availableDates.has(toYMD(date)) || toYMD(date) < todayYMD) return;
    setSelectedDate(date);
    setSelectedSlot(null);
    void loadSlots(date);
  }

  function goToPreviousMonth() {
    if (viewYear === currentYear && viewMonth === currentMonth - 1) return;
    const previous = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(previous.getFullYear());
    setViewMonth(previous.getMonth());
    void loadDates(previous.getFullYear(), previous.getMonth());
  }

  function goToNextMonth() {
    const next = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    void loadDates(next.getFullYear(), next.getMonth());
  }

  async function handleConfirm() {
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await rescheduleAppointment(appointmentId, selectedSlot.datetime);
      onSuccess();
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Could not reschedule. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const calendarRows = buildMonthGrid(viewYear, viewMonth);
  const previousMonthDisabled =
    viewYear === currentYear && viewMonth === currentMonth - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>RESCHEDULE</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {appointmentType}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <SvgIcon name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {/* Date picker */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SELECT DATE</Text>
            <View style={[styles.monthNav, { borderColor: colors.border }]}>
              <TouchableOpacity
                onPress={goToPreviousMonth}
                disabled={previousMonthDisabled}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                accessibilityState={{ disabled: previousMonthDisabled }}
                style={styles.monthNavButton}
              >
                <SvgIcon
                  name="chevron-left"
                  size={20}
                  color={previousMonthDisabled ? colors.muted : colors.foreground}
                />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.foreground }]}>
                {formatMonthLabel(viewYear, viewMonth)}
              </Text>
              <TouchableOpacity
                onPress={goToNextMonth}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.monthNavButton}
              >
                <SvgIcon name="chevron-right" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={styles.dayHeaders}>
              {DAY_HEADERS.map((day) => (
                <Text key={day} style={[styles.dayHeader, { color: colors.mutedForeground }]}>
                  {day}
                </Text>
              ))}
            </View>

            {datesLoading ? (
              <View style={styles.dateStateArea}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Loading availability…
                </Text>
              </View>
            ) : datesError ? (
              <View style={styles.dateStateArea}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{datesError}</Text>
                <TouchableOpacity
                  onPress={() => void loadDates(viewYear, viewMonth)}
                  style={[styles.retryButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.retryButtonText, { color: colors.primary }]}>TRY AGAIN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.calendarGrid}>
                  {calendarRows.map((week, weekIndex) => (
                    <View key={`week-${weekIndex}`} style={styles.calendarRow}>
                      {week.map((dayNumber, dayIndex) => {
                        if (dayNumber === null) {
                          return <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.dayCell} />;
                        }
                        const date = new Date(viewYear, viewMonth, dayNumber, 12);
                        const ymd = toYMD(date);
                        const isPast = ymd < todayYMD;
                        const isAvailable = availableDates.has(ymd);
                        const isSelected = selectedDate ? toYMD(selectedDate) === ymd : false;
                        const isDisabled = isPast || !isAvailable;

                        return (
                          <TouchableOpacity
                            key={ymd}
                            onPress={() => handleSelectDate(date)}
                            disabled={isDisabled}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                            accessibilityLabel={`${date.toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                            })}${isAvailable ? '' : ', unavailable'}`}
                            style={[
                              styles.dayCell,
                              isSelected && {
                                backgroundColor: colors.primary,
                                borderRadius: 10,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayNumber,
                                isSelected
                                  ? { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }
                                  : isAvailable && !isPast
                                    ? { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }
                                    : {
                                        color: colors.mutedForeground,
                                        opacity: 0.35,
                                        fontFamily: 'Inter_400Regular',
                                      },
                              ]}
                            >
                              {dayNumber}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
                {availableDates.size === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    No availability in {formatMonthLabel(viewYear, viewMonth)}.
                  </Text>
                ) : null}
              </>
            )}

            {/* Time slots */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
              SELECT TIME
            </Text>
            <View style={styles.slotsArea}>
              {!selectedDate ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Select an available date to view times.
                </Text>
              ) : loadingSlots ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
              ) : slotsError ? (
                <Text style={[styles.errorText, { color: colors.destructive }]}>{slotsError}</Text>
              ) : slots.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No available times on this date.
                </Text>
              ) : (
                <View style={styles.slotGrid}>
                  {slots.map((slot, i) => {
                    const isSelected = slot.datetime === selectedSlot?.datetime;
                    return (
                      <TouchableOpacity
                        key={`${slot.datetime}-${i}`}
                        onPress={() => setSelectedSlot(slot)}
                        style={[
                          styles.slotPill,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.card,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.slotText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                          {formatStudioTime(slot.time)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Error */}
          {submitError ? (
            <Text style={[styles.errorText, { color: colors.destructive, marginTop: 8 }]}>
              {submitError}
            </Text>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.btnSecondary, { borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selectedSlot || submitting}
              style={[
                styles.btnPrimary,
                {
                  backgroundColor: colors.primary,
                  opacity: (!selectedSlot || submitting) ? 0.4 : 1,
                },
              ]}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={[styles.btnPrimaryText, { color: colors.primaryForeground }]}>CONFIRM</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  sheetContent: { paddingBottom: 4 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 22,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  monthNavButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 17,
    letterSpacing: 1.2,
  },
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
  calendarGrid: { marginBottom: 4 },
  calendarRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayNumber: {
    fontSize: 14,
    textAlign: 'center',
  },
  dateStateArea: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  slotsArea: {
    minHeight: 80,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  slotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  btnPrimary: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
});
