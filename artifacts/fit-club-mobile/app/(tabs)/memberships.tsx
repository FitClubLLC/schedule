/**
 * Memberships screen — fallback for when the tab-button interception in
 * _layout.tsx doesn't fire (e.g. NativeTabs unstable API on some iOS builds).
 *
 * Normally tapping Memberships opens Acuity directly via the tab-button
 * onPress handler and this screen is never rendered. If that fails, the
 * member lands here and sees a button to open Acuity manually.
 */
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useColors } from '@/hooks/useColors';

// Same URL that _layout.tsx opens — kept in sync manually.
const MEMBERSHIPS_URL = 'https://app.acuityscheduling.com/catalog.php';

export default function MembershipsScreen() {
  const colors = useColors();

  // Try to open automatically in case the tab-button handler fired but the
  // URL open failed silently.
  useEffect(() => {
    Linking.openURL(MEMBERSHIPS_URL).catch(() => {});
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>MEMBERSHIPS</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Browse and purchase memberships through Acuity Scheduling.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => Linking.openURL(MEMBERSHIPS_URL).catch(() => {})}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          OPEN MEMBERSHIPS
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 3,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
