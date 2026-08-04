import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

interface MobileLocation {
  id: string;
  name: string;
  calendarId: string;
}

function getMobileLocations(): MobileLocation[] {
  const locs: MobileLocation[] = [];
  const n1 = process.env.EXPO_PUBLIC_LOCATION_1_NAME;
  const c1 = process.env.EXPO_PUBLIC_LOCATION_1_CALENDAR_ID;
  const n2 = process.env.EXPO_PUBLIC_LOCATION_2_NAME;
  const c2 = process.env.EXPO_PUBLIC_LOCATION_2_CALENDAR_ID;
  if (n1 && c1) locs.push({ id: '1', name: n1, calendarId: c1 });
  if (n2 && c2) locs.push({ id: '2', name: n2, calendarId: c2 });
  return locs;
}

const LOC_ACCENT = ['#D3AF37', '#4A9EFF'];

function LocationBadge({ calendarID }: { calendarID?: number | null }) {
  const colors = useColors();
  if (!calendarID) return null;
  const locations = getMobileLocations();
  const loc = locations.find((l) => l.calendarId === String(calendarID));
  if (!loc) return null;
  const idx = locations.indexOf(loc);
  const accent = LOC_ACCENT[idx % LOC_ACCENT.length];
  return (
    <View style={[styles.badge, { backgroundColor: accent + '22', borderColor: accent + '66' }]}>
      <Feather name="map-pin" size={10} color={accent} />
      <Text style={[styles.badgeText, { color: accent }]}>{loc.name}</Text>
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

interface Props {
  appointment: Appointment;
  highlighted?: boolean;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

          {/* Location badge */}
          <LocationBadge calendarID={appointment.calendarID} />
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
    gap: 4,
    alignSelf: 'flex-start',
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
});
