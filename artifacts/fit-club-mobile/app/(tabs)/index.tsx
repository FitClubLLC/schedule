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
import SvgIcon from '@/components/SvgIcon';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AppointmentCard from '@/components/AppointmentCard';
import { useSessionReminders } from '@/hooks/useSessionReminders';

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
  const { signOut, isSignedIn } = useAuth();
  const router = useRouter();

  const summaryQuery = useGetAppointmentSummary({ query: { enabled: !!isSignedIn } });
  const upcomingQuery = useGetUpcomingAppointments({ query: { enabled: !!isSignedIn } });

  const summary = summaryQuery.data;
  const upcoming = upcomingQuery.data ?? [];
  const isLoading = summaryQuery.isLoading;

  // Schedule a local push notification ~60 min before each upcoming session.
  // Pass raw query data (undefined while loading/error) so we only clear reminders
  // when we have a confirmed response — not when the query is still in flight.
  useSessionReminders(upcomingQuery.data);
  const isRefreshing = summaryQuery.isFetching && !summaryQuery.isLoading;
  const summaryError = summaryQuery.isError;
  const upcomingError = upcomingQuery.isError;

  const todayYMD = new Date().toISOString().split('T')[0];
  const todaysSessions = upcoming.filter((a) => a.date === todayYMD);

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
              <SvgIcon name="x" size={22} color={colors.mutedForeground} />
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
                <SvgIcon name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
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
                <SvgIcon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
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
            <SvgIcon name="key" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} hitSlop={8} activeOpacity={0.7}>
            <SvgIcon name="log-out" size={20} color={colors.mutedForeground} />
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
            {(user?.firstName || user?.fullName?.split(' ')[0])?.toUpperCase() ?? 'MEMBER'}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/book')}
            activeOpacity={0.8}
            style={[styles.bookBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.bookBtnText}>Book a Session</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        {isLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : summaryError ? (
          <View style={[styles.apiErrorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SvgIcon name="wifi-off" size={18} color={colors.mutedForeground} />
            <Text style={[styles.apiErrorText, { color: colors.mutedForeground }]}>
              Session data unavailable — pull down to retry
            </Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => router.push('/(tabs)/appointments')}
              activeOpacity={0.7}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {summary?.upcomingCount ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>UPCOMING</Text>
            </TouchableOpacity>
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

        {/* Today's sessions */}
        {!upcomingQuery.isLoading && !upcomingError && (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => router.push('/(tabs)/appointments')}
            style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {/* Left accent + date column */}
            <View style={[styles.todayAccent, { backgroundColor: colors.primary }]} />
            <View style={styles.todayDateCol}>
              <Text style={[styles.todayDayNum, { color: colors.primary }]}>
                {new Date().getDate()}
              </Text>
              <Text style={[styles.todayDayName, { color: colors.mutedForeground }]}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Text>
              <Text style={[styles.todayMonth, { color: colors.mutedForeground }]}>
                {new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.todayDivider, { backgroundColor: colors.border }]} />

            {/* Sessions column */}
            <View style={styles.todaySessions}>
              <Text style={[styles.todayLabel, { color: colors.mutedForeground }]}>TODAY</Text>
              {todaysSessions.length === 0 ? (
                <Text style={[styles.todayRestText, { color: colors.foreground }]}>Rest day</Text>
              ) : (
                todaysSessions.map((appt) => (
                  <View key={appt.id} style={styles.todayRow}>
                    <Text style={[styles.todayTime, { color: colors.primary }]}>
                      {new Date(appt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                    <Text style={[styles.todayType, { color: colors.foreground }]} numberOfLines={1}>
                      {appt.type}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Next session */}
        {summary?.nextAppointment && (
          <TouchableOpacity
            style={styles.section}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/appointments');
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              NEXT SESSION
            </Text>
            <AppointmentCard appointment={summary.nextAppointment} highlighted />
          </TouchableOpacity>
        )}

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
            <SvgIcon name="plus" size={20} color={colors.primaryForeground} />
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
  bookBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bookBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#000',
    letterSpacing: 0.3,
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
  todayCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
    minHeight: 100,
  },
  todayAccent: {
    width: 4,
  },
  todayDateCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minWidth: 60,
  },
  todayDayNum: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 36,
    lineHeight: 36,
  },
  todayDayName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  todayMonth: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  todayDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  todaySessions: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 6,
  },
  todayLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  todayRestText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  todayTime: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    minWidth: 72,
  },
  todayType: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 15,
    letterSpacing: 0.3,
    flex: 1,
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
