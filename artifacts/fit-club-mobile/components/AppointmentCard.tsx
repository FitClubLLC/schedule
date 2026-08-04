import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';

// Two accent colours — index 0 = location 1 (POTOMAC), index 1 = location 2 (KENTLANDS)
const LOC_ACCENT = ['#D3AF37', '#4A9EFF'];

interface MobileLocation {
  name: string;
  calendarId: string;
}

function getMobileLocations(): MobileLocation[] {
  return [
    {
      name:       process.env.EXPO_PUBLIC_LOCATION_1_NAME       ?? 'POTOMAC',
      calendarId: process.env.EXPO_PUBLIC_LOCATION_1_CALENDAR_ID ?? '',
    },
    {
      name:       process.env.EXPO_PUBLIC_LOCATION_2_NAME       ?? 'KENTLANDS',
      calendarId: process.env.EXPO_PUBLIC_LOCATION_2_CALENDAR_ID ?? '',
    },
  ];
}

function LocationBadge({ calendarName }: { calendarName?: string | null }) {
  const colors = useColors();
  if (!calendarName) return null;

  const locations = getMobileLocations();
  const idx = locations.findIndex(
    (l) => l.name.toLowerCase() === calendarName.toLowerCase(),
  );
  const accent = idx >= 0 ? LOC_ACCENT[idx % LOC_ACCENT.length] : colors.mutedForeground;

  return (
    <View style={[styles.badge, { backgroundColor: accent + '22', borderColor: accent + '66' }]}>
      <SvgIcon name="map-pin" size={10} color={accent} />
      <Text style={[styles.badgeText, { color: accent }]}>{calendarName}</Text>
    </View>
  );
}

interface Appointment {
  id: number;
  type: string;
  date: string;
  time: string;
  endTime: string;
  duration: number;
  location?: string | null;
  calendar?: string | null;
  calendarID?: number | null;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AppointmentCard({
  appointment,
  highlighted = false,
  onReschedule,
  onCancel,
}: {
  appointment: Appointment;
  highlighted?: boolean;
  onReschedule?: () => void;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const showActions = !!(onReschedule || onCancel);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: highlighted ? colors.primary : colors.border,
          borderLeftColor: colors.primary,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Date block */}
        <View style={styles.dateBlock}>
          <Text style={[styles.dateDay, { color: colors.primary }]}>
            {new Date(appointment.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })}
          </Text>
          <Text style={[styles.dateMonth, { color: colors.mutedForeground }]}>
            {new Date(appointment.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Details */}
        <View style={styles.details}>
          <Text style={[styles.type, { color: colors.foreground }]} numberOfLines={1}>
            {appointment.type}
          </Text>

          <View style={styles.metaRow}>
            <SvgIcon name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {formatTime(appointment.time)} · {appointment.duration} min
            </Text>
          </View>

          {appointment.location ? (
            <View style={styles.metaRow}>
              <SvgIcon name="map-pin" size={12} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {appointment.location}
              </Text>
            </View>
          ) : null}

          {/* Location badge — resolved from calendar name */}
          <LocationBadge calendarName={appointment.calendar} />
        </View>
      </View>

      {showActions && (
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {onReschedule && (
            <TouchableOpacity
              onPress={onReschedule}
              style={[styles.actionBtn, styles.actionBtnLeft, { borderRightColor: colors.border }]}
              activeOpacity={0.7}
            >
              <SvgIcon name="rotate-ccw" size={13} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>RESCHEDULE</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.actionBtn, styles.actionBtnRight]}
              activeOpacity={0.7}
            >
              <SvgIcon name="trash-2" size={13} color={colors.destructive} />
              <Text style={[styles.actionText, { color: colors.destructive }]}>CANCEL</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  dateBlock: { alignItems: 'center', minWidth: 36 },
  dateDay: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    lineHeight: 28,
  },
  dateMonth: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: { width: StyleSheet.hairlineWidth, height: 44 },
  details: { flex: 1, gap: 4 },
  type: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  actionBtnLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  actionBtnRight: {},
  actionText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
