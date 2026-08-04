import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useUser, useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetAppointmentSummary, useGetUpcomingAppointments } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AppointmentCard from '@/components/AppointmentCard';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'GOOD MORNING';
  if (hour < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const summaryQuery = useGetAppointmentSummary();
  const upcomingQuery = useGetUpcomingAppointments();

  const summary = summaryQuery.data;
  const upcoming = upcomingQuery.data ?? [];
  const isLoading = summaryQuery.isLoading;
  const isRefreshing = summaryQuery.isFetching && !summaryQuery.isLoading;
  const summaryError = summaryQuery.isError;
  const upcomingError = upcomingQuery.isError;

  // Change password modal state
  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const resetPwForm = () => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCurrent(false); setShowNew(false); setPwLoading(false);
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Passwords don\'t match', 'Your new passwords must match.');
      return;
    }
    if (newPw.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPwLoading(true);
    try {
      await user?.updatePassword({ currentPassword: currentPw, newPassword: newPw });
      resetPwForm();
      setPwModalVisible(false);
      Alert.alert('Password updated', 'Your password has been changed successfully.');
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        'Failed to update password. Check your current password and try again.';
      Alert.alert('Error', msg);
    } finally {
      setPwLoading(false);
    }
  };

  const onRefresh = () => {
    summaryQuery.refetch();
    upcomingQuery.refetch();
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut();
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Change Password Modal */}
      <Modal
        visible={pwModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setPwModalVisible(false); resetPwForm(); }}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>CHANGE PASSWORD</Text>
            <TouchableOpacity
              onPress={() => { setPwModalVisible(false); resetPwForm(); }}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Current password */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CURRENT PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Enter current password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showCurrent}
                value={currentPw}
                onChangeText={setCurrentPw}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowCurrent(v => !v)} hitSlop={8}>
                <Feather name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* New password */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>NEW PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showNew}
                value={newPw}
                onChangeText={setNewPw}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={8}>
                <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>CONFIRM NEW PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Repeat new password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                value={confirmPw}
                onChangeText={setConfirmPw}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.pwSubmitBtn,
                { backgroundColor: colors.primary },
                (pwLoading || !currentPw || !newPw || !confirmPw) && { opacity: 0.45 },
              ]}
              onPress={handleChangePassword}
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              activeOpacity={0.8}
            >
              {pwLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.pwSubmitText, { color: colors.primaryForeground }]}>
                  UPDATE PASSWORD
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 14,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Image
          source={require('@/assets/images/fitclub-logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setPwModalVisible(true)}
            hitSlop={8}
            activeOpacity={0.7}
            style={styles.headerBtn}
          >
            <Feather name="key" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} hitSlop={8} activeOpacity={0.7}>
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {user?.firstName?.toUpperCase() ?? 'MEMBER'}
          </Text>
        </View>

        {/* Stats row */}
        {isLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : summaryError ? (
          <View style={[styles.apiErrorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="wifi-off" size={18} color={colors.mutedForeground} />
            <Text style={[styles.apiErrorText, { color: colors.mutedForeground }]}>
              Session data unavailable — pull down to retry
            </Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {summary?.upcomingCount ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>UPCOMING</Text>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statNumber, { color: colors.foreground }]}>
                {summary?.pastCount ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>COMPLETED</Text>
            </View>
          </View>
        )}

        {/* Next session */}
        {summary?.nextAppointment && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              NEXT SESSION
            </Text>
            <AppointmentCard appointment={summary.nextAppointment} highlighted />
          </View>
        )}

        {/* Upcoming sessions list */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              UPCOMING SESSIONS
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/appointments')}
              activeOpacity={0.7}
            >
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
            </TouchableOpacity>
          </View>

          {upcomingQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : upcomingError ? (
            <View style={[styles.apiErrorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="wifi-off" size={18} color={colors.mutedForeground} />
              <Text style={[styles.apiErrorText, { color: colors.mutedForeground }]}>
                Session data unavailable — pull down to retry
              </Text>
            </View>
          ) : upcoming.length === 0 ? (
            <View
              style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="calendar" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No upcoming sessions
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/book')}
                style={[styles.bookCta, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.bookCtaText, { color: colors.primaryForeground }]}>
                  BOOK A SESSION
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            upcoming.slice(0, 3).map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))
          )}
        </View>

        {/* Book CTA */}
        {upcoming.length > 0 && (
          <TouchableOpacity
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/book');
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={20} color={colors.primaryForeground} />
            <Text style={[styles.bookBtnText, { color: colors.primaryForeground }]}>
              BOOK A SESSION
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLogo: {
    width: 100,
    height: 48,
  },
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  greetingSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  greeting: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 2,
  },
  name: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 38,
    letterSpacing: 2,
    marginTop: 2,
  },
  statsLoading: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiErrorCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  apiErrorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 42,
    lineHeight: 44,
  },
  statLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  seeAll: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginBottom: 10,
  },
  emptyCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  bookCta: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  bookCtaText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 16,
    marginBottom: 16,
  },
  bookBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 18,
    letterSpacing: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerBtn: {},
  // Change password modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 22,
    letterSpacing: 2,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  pwSubmitBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  pwSubmitText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 18,
    letterSpacing: 2.5,
  },
});
