import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SvgIcon from '@/components/SvgIcon';

const OWNER_ID = '36930698';

const LOCATIONS = [
  {
    id: '1',
    name: 'POTOMAC',
    calendarId: '12741713',
    color: '#D3AF37',
    colorMuted: 'rgba(211,175,55,0.13)',
    colorBorder: 'rgba(211,175,55,0.4)',
  },
  {
    id: '2',
    name: 'KENTLANDS',
    calendarId: '14311114',
    color: '#4A9EFF',
    colorMuted: 'rgba(74,158,255,0.13)',
    colorBorder: 'rgba(74,158,255,0.4)',
  },
];

function acuityUrl(calendarId: string) {
  return `https://app.acuityscheduling.com/schedule.php?owner=${OWNER_ID}&calendarID=${calendarId}`;
}

export default function BookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleBook = async (calendarId: string, name: string) => {
    const url = acuityUrl(calendarId);
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', `Unable to open booking page for ${name}.`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Book a Session</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Choose your preferred location to view availability and book.
        </Text>
      </View>

      {/* Location cards */}
      <View style={styles.cards}>
        {LOCATIONS.map((loc) => (
          <TouchableOpacity
            key={loc.id}
            onPress={() => handleBook(loc.calendarId, loc.name)}
            activeOpacity={0.75}
            style={[
              styles.card,
              {
                backgroundColor: loc.colorMuted,
                borderColor: loc.colorBorder,
              },
            ]}
          >
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: loc.colorMuted }]}>
              <SvgIcon name="map-pin" size={22} color={loc.color} />
            </View>

            {/* Text */}
            <View style={styles.cardBody}>
              <Text style={[styles.locName, { color: loc.color }]}>{loc.name}</Text>
              <Text style={[styles.locSub, { color: colors.textMuted }]}>
                View availability &amp; book a session
              </Text>
            </View>

            {/* Button */}
            <View style={[styles.btn, { backgroundColor: loc.color }]}>
              <Text style={styles.btnText}>Book Now</Text>
              <SvgIcon name="external-link" size={14} color="#000" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  cards: {
    gap: 16,
  },
  card: {
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 24,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    gap: 4,
  },
  locName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  locSub: {
    fontSize: 14,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
});
