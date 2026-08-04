import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

interface Appointment {
  id: number;
  type: string;
  date: string;
  time: string;
  endTime: string;
  duration: number;
  location?: string | null;
  calendar?: string | null;
}

interface Props {
  appointment: Appointment;
  /** If true, render the card with a gold highlight (e.g. "next session") */
  highlighted?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AppointmentCard({ appointment, highlighted = false }: Props) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: highlighted ? colors.primary : colors.border,
          borderLeftColor: highlighted ? colors.primary : colors.primary,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.dateBlock}>
          <Text style={[styles.dateDay, { color: colors.primary }]}>
            {new Date(appointment.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric' })}
          </Text>
          <Text style={[styles.dateMonth, { color: colors.mutedForeground }]}>
            {new Date(appointment.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.details}>
          <Text style={[styles.type, { color: colors.foreground }]} numberOfLines={1}>
            {appointment.type}
          </Text>
          <View style={styles.metaRow}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {formatTime(appointment.time)} · {appointment.duration} min
            </Text>
          </View>
          {appointment.location ? (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={12} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {appointment.location}
              </Text>
            </View>
          ) : appointment.calendar ? (
            <View style={styles.metaRow}>
              <Feather name="user" size={12} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {appointment.calendar}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
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
  dateBlock: {
    alignItems: 'center',
    minWidth: 36,
  },
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
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 44,
    backgroundColor: '#37322B',
  },
  details: {
    flex: 1,
    gap: 4,
  },
  type: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    flex: 1,
  },
});
