import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';

const MEMBERSHIPS_URL = 'https://app.acuityscheduling.com/catalog.php?owner=36930698';

export default function MembershipsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [openingCatalog, setOpeningCatalog] = useState(false);

  useAppForegroundRefresh([['member-certificates']]);

  const openMembershipCatalog = async () => {
    setOpeningCatalog(true);
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(MEMBERSHIPS_URL);
      } else {
        await WebBrowser.openBrowserAsync(MEMBERSHIPS_URL, {
          dismissButtonStyle: 'close',
          toolbarColor: colors.background,
          controlsColor: colors.primary,
        });
      }
    } catch {
      Alert.alert(
        'Unable to open memberships',
        'Please try again in a moment.',
      );
    } finally {
      setOpeningCatalog(false);
      await queryClient.invalidateQueries({ queryKey: ['member-certificates'] });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>MEMBERSHIPS</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Purchase securely through Acuity. When you return, your package will refresh automatically.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        disabled={openingCatalog}
        onPress={openMembershipCatalog}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {openingCatalog ? 'OPENING ACUITY…' : 'OPEN MEMBERSHIPS'}
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
    maxWidth: 320,
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
