import React, { useCallback, useEffect, useState } from 'react';
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

// Build an array of the next `count` dates starting from today.
function buildDateRange(count = 14): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function toYMD(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function formatTimeLabel(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

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
  const { fetchAvailableTimes, rescheduleAppointment } = useAppointmentActions();

  const dates = buildDateRange(14);
  const [selectedDate, setSelectedDate] = useState<Date>(dates[0]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadSlots = useCallback(async (date: Date) => {
    setLoadingSlots(true);
    setSlotsError('');
    setSlots([]);
    setSelectedSlot(null);
    try {
      const result = await fetchAvailableTimes(appointmentId, toYMD(date));
      setSlots(result ?? []);
    } catch (err: any) {
      setSlotsError(err?.message ?? 'Could not load available times.');
    } finally {
      setLoadingSlots(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (visible) {
      setSelectedDate(dates[0]);
      setSelectedSlot(null);
      setSubmitError('');
      loadSlots(dates[0]);
    }
  }, [visible]);

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    loadSlots(date);
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

          {/* Date picker */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SELECT DATE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateRow}
          >
            {dates.map((date) => {
              const isSelected = toYMD(date) === toYMD(selectedDate);
              return (
                <TouchableOpacity
                  key={toYMD(date)}
                  onPress={() => handleSelectDate(date)}
                  style={[
                    styles.datePill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.datePillDay, { color: isSelected ? colors.primaryForeground : colors.mutedForeground }]}>
                    {formatDayLabel(date)}
                  </Text>
                  <Text style={[styles.datePillNum, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Time slots */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>SELECT TIME</Text>
          <View style={styles.slotsArea}>
            {loadingSlots ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : slotsError ? (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{slotsError}</Text>
            ) : slots.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No available times on this date.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
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
                          {formatTimeLabel(slot.time)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

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
  },
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
  dateRow: {
    gap: 8,
    paddingRight: 8,
  },
  datePill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 52,
  },
  datePillDay: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  datePillNum: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    lineHeight: 24,
    marginTop: 2,
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
