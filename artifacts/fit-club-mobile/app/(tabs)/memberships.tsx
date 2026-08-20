import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customFetch,
  getAcuityMembershipCatalogUrl,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';
import SvgIcon from '@/components/SvgIcon';
import {
  MEMBER_CERTIFICATES_QUERY_KEY,
  scheduleMobileCatalogCertificateRefreshes,
} from '@/lib/membershipRefresh';

interface AcuityCatalogConfig {
  ownerId: string;
}

export default function MembershipsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [openingCatalog, setOpeningCatalog] = useState(false);
  const configQuery = useQuery<AcuityCatalogConfig>({
    queryKey: ['acuity-config'],
    queryFn: () => customFetch<AcuityCatalogConfig>('/api/booking/config', {
      method: 'GET',
      responseType: 'json',
    }),
  });
  const catalogUrl = configQuery.data
    ? getAcuityMembershipCatalogUrl(configQuery.data.ownerId)
    : null;

  useAppForegroundRefresh([MEMBER_CERTIFICATES_QUERY_KEY]);

  const refreshCertificates = () =>
    queryClient.invalidateQueries({ queryKey: MEMBER_CERTIFICATES_QUERY_KEY });

  const openMembershipCatalog = async () => {
    if (!catalogUrl) {
      Alert.alert(
        'Memberships unavailable',
        'Please try again in a moment.',
      );
      return;
    }

    setOpeningCatalog(true);
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(catalogUrl);
      } else {
        await WebBrowser.openBrowserAsync(catalogUrl, {
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
      // Browser close is not proof of purchase. It only gives Acuity a chance
      // to return the authoritative package data after normal propagation.
      void refreshCertificates();
      scheduleMobileCatalogCertificateRefreshes(() => {
        void refreshCertificates();
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>MEMBERSHIPS</Text>
      {configQuery.isError ? (
        <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SvgIcon name="wifi-off" size={20} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Memberships unavailable
          </Text>
          <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
            We couldn&apos;t load the secure Acuity membership catalog. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.primary }]}
            activeOpacity={0.8}
            accessibilityRole="button"
            onPress={() => void configQuery.refetch()}
          >
            <Text style={[styles.retryButtonText, { color: colors.primary }]}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Purchase securely through Acuity. When you return, your package will refresh automatically.
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
            disabled={openingCatalog || !catalogUrl}
            onPress={openMembershipCatalog}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {openingCatalog
                ? 'OPENING ACUITY…'
                : configQuery.isLoading
                ? 'LOADING MEMBERSHIPS…'
                : 'OPEN MEMBERSHIPS'}
            </Text>
          </TouchableOpacity>
        </>
      )}
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
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 360,
  },
  errorTitle: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 21,
    letterSpacing: 0.5,
  },
  errorBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 2,
  },
  retryButtonText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
});
