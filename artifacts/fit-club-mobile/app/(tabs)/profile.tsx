import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Linking, Platform, Switch,
} from 'react-native';
import { useUser, useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import SvgIcon, { type SvgIconName } from '@/components/SvgIcon';
import {
  isBiometricAvailable, hasSavedCreds, clearCreds,
} from '@/hooks/useBiometrics';
import {
  type NotifTiming, NOTIF_TIMING_KEY, PREF_LOCATION_KEY, DEFAULT_NOTIF_TIMING,
} from '@/lib/notificationPrefs';
import { useGetUpcomingAppointments } from '@workspace/api-client-react';
import { useSessionReminders } from '@/hooks/useSessionReminders';
import { getSessionReminderStatusCopy } from '@/lib/sessionReminderPresentation';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

// Locations match the env-var defaults used across the app
const LOCATIONS = [
  { id: '1', name: process.env.EXPO_PUBLIC_LOCATION_1_NAME ?? 'Potomac' },
  { id: '2', name: process.env.EXPO_PUBLIC_LOCATION_2_NAME ?? 'Kentlands' },
];

const PRIVACY_POLICY_URL = 'https://fitclub15.com/privacy';

const NOTIF_OPTIONS: { value: NotifTiming; label: string; sub: string }[] = [
  { value: '24h',  label: '24 hours before', sub: 'Reminder the day before your session' },
  { value: '2h',   label: '2 hours before',  sub: 'Reminder a couple hours out' },
  { value: 'both', label: 'Both',             sub: '24-hour and 2-hour reminders' },
  { value: 'off',  label: 'Off',              sub: 'No session reminders' },
];

type DeletionRequest = {
  id?: string;
  status: string;
  requestedAt?: string;
  updatedAt?: string;
};

type DeletionStatus = 'idle' | 'loading' | 'ready' | 'error';

function isDeletionRequest(value: unknown): value is DeletionRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'string'
  );
}

// ─── Reusable sub-components ────────────────────────────────────────────────

function SectionLabel({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
      {title}
    </Text>
  );
}

function SettingRow({
  icon, label, value, onPress, destructive, colors, accessibilityRole, accessibilityLabel,
}: {
  icon: SvgIconName; label: string; value?: string;
  onPress?: () => void; destructive?: boolean; colors: any;
  accessibilityRole?: 'button' | 'link'; accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
    >
      <SvgIcon name={icon} size={18} color={destructive ? colors.destructive : colors.mutedForeground} />
      <Text style={[styles.settingLabel, { color: destructive ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      {onPress && !destructive ? (
        <SvgIcon name="chevron-right" size={16} color={colors.mutedForeground} />
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut, getToken, isSignedIn } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // ── Name editing ──────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  // null = not yet attempted; true = works; false = Clerk rejected (not editable)
  const [nameEditingSupported, setNameEditingSupported] = useState<boolean | null>(null);
  const nameDirty =
    firstName.trim() !== (user?.firstName ?? '') ||
    lastName.trim() !== (user?.lastName ?? '');

  // Clerk may resolve the user resource after this screen first mounts.
  // Keep the editable fields aligned with the refreshed server data.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
  }, [user?.id, user?.firstName, user?.lastName]);

  // ── Preferred location ────────────────────────────────────────────────────
  const [prefLocation, setPrefLocationState] = useState<string | null>(null);

  // ── Notification timing ───────────────────────────────────────────────────
  const [notifTiming, setNotifTimingState] = useState<NotifTiming>(DEFAULT_NOTIF_TIMING);
  const [notifTimingLoaded, setNotifTimingLoaded] = useState(false);

  // ── Biometrics ────────────────────────────────────────────────────────────
  const [biometricHardware, setBiometricHardware] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricToggling, setBiometricToggling] = useState(false);

  // ── Change password modal ─────────────────────────────────────────────────
  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // ── Account deletion request ──────────────────────────────────────────────
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus>('loading');
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [deletionStatusError, setDeletionStatusError] = useState('');
  const [deletionSuccess, setDeletionSuccess] = useState(false);
  const [deletionModalVisible, setDeletionModalVisible] = useState(false);
  const [deletionStep, setDeletionStep] = useState<1 | 2>(1);
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [deletionSubmitError, setDeletionSubmitError] = useState('');
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);

  // ── Signing out ───────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false);

  const upcomingQuery = useGetUpcomingAppointments({
    query: { enabled: !!isSignedIn },
  });
  const reminderStatus = useSessionReminders(
    upcomingQuery.data,
    notifTimingLoaded ? notifTiming : undefined,
  );
  const reminderStatusCopy = getSessionReminderStatusCopy(reminderStatus);

  // ── Account deletion request status ────────────────────────────────────────
  // This request is deliberately independent of the rest of Profile. A
  // temporary API failure should leave settings usable while offering retry.
  const loadDeletionStatus = async () => {
    if (isSignedIn !== true) {
      setDeletionStatus('idle');
      return;
    }

    setDeletionStatus('loading');
    setDeletionStatusError('');
    try {
      const token = await getTokenRef.current();
      if (!token) throw new Error('Not signed in.');

      const response = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/user/deletion-request`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const body = await response.json();
      setDeletionRequest(isDeletionRequest(body?.deletionRequest) ? body.deletionRequest : null);
      setDeletionStatus('ready');
    } catch {
      setDeletionStatus('error');
      setDeletionStatusError('We couldn’t check your request status. Please try again.');
    }
  };

  useEffect(() => {
    void loadDeletionStatus();
    // The Clerk hook can replace getToken between renders. The latest getter is
    // read through getTokenRef, so this effect must only follow auth state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  // ── Load preferences on mount ─────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(PREF_LOCATION_KEY).then((v) => v && setPrefLocationState(v));
    AsyncStorage.getItem(NOTIF_TIMING_KEY)
      .then((v) => {
        if (v === '24h' || v === '2h' || v === 'both' || v === 'off') {
          setNotifTimingState(v as NotifTiming);
        }
      })
      .catch(() => {})
      .finally(() => setNotifTimingLoaded(true));
    Promise.all([isBiometricAvailable(), hasSavedCreds()]).then(([avail, saved]) => {
      setBiometricHardware(avail);
      setBiometricEnabled(saved);
    });
  }, []);

  // ── Name save (via backend admin API — bypasses Clerk's user-editable setting) ──
  const handleSaveName = useCallback(async () => {
    if (!nameDirty || nameSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNameSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in.');
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const res = await fetch(`${baseUrl}/api/user/profile`, {  // mounted at /api in app.ts
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Server error ${res.status}`);
      }
      // Refresh Clerk's local user object so the UI reflects the new name
      await user?.reload();
      setNameEditingSupported(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setNameSaving(false);
    }
  }, [firstName, lastName, nameDirty, nameSaving, user, getToken]);

  // ── Location preference ───────────────────────────────────────────────────
  const handleSelectLocation = useCallback(async (id: string) => {
    Haptics.selectionAsync();
    setPrefLocationState(id);
    await AsyncStorage.setItem(PREF_LOCATION_KEY, id);
  }, []);

  // ── Notification timing ───────────────────────────────────────────────────
  const handleSelectNotifTiming = useCallback(async (value: NotifTiming) => {
    Haptics.selectionAsync();
    setNotifTimingState(value);
    await AsyncStorage.setItem(NOTIF_TIMING_KEY, value);
  }, []);

  // ── Biometric toggle ──────────────────────────────────────────────────────
  const handleBiometricToggle = useCallback(async (enabled: boolean) => {
    setBiometricToggling(true);
    try {
      if (!enabled) {
        await clearCreds();
        setBiometricEnabled(false);
      } else {
        // Biometric enrolment is handled at sign-in — inform the user
        Alert.alert(
          'Enable Biometric Login',
          'Sign out and sign back in with your password to enable biometric login. You will be prompted to save your credentials.',
        );
      }
    } finally {
      setBiometricToggling(false);
    }
  }, []);

  // ── Change password ───────────────────────────────────────────────────────
  const resetPwForm = useCallback(() => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCurrent(false); setShowNew(false); setPwLoading(false);
  }, []);

  const handleChangePassword = useCallback(async () => {
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
      Alert.alert(
        'Error',
        err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Check your current password and try again.',
      );
    } finally {
      setPwLoading(false);
    }
  }, [currentPw, newPw, confirmPw, user, resetPwForm]);

  const closeDeletionModal = useCallback(() => {
    if (deletionSubmitting) return;
    setDeletionModalVisible(false);
    setDeletionStep(1);
    setDeletionConfirmation('');
    setDeletionSubmitError('');
  }, [deletionSubmitting]);

  const openDeletionModal = useCallback(() => {
    if (deletionStatus !== 'ready' || deletionRequest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDeletionSuccess(false);
    setDeletionSubmitError('');
    setDeletionStep(1);
    setDeletionConfirmation('');
    setDeletionModalVisible(true);
  }, [deletionRequest, deletionStatus]);

  const handleSubmitDeletionRequest = useCallback(async () => {
    if (deletionSubmitting || deletionConfirmation !== 'DELETE') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeletionSubmitting(true);
    setDeletionSubmitError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in.');

      const response = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/user/deletion-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ confirmation: 'DELETE' }),
        },
      );

      const body = response.status === 200 || response.status === 201
        ? await response.json().catch(() => ({}))
        : {};
      if (response.status !== 200 && response.status !== 201) {
        throw new Error('Deletion request failed.');
      }

      // The API is idempotent: both a newly created request (201) and an
      // existing active request (200) put the member in the same pending UI.
      setDeletionRequest(
        isDeletionRequest(body?.deletionRequest)
          ? body.deletionRequest
          : { status: 'pending' },
      );
      setDeletionSuccess(true);
      setDeletionModalVisible(false);
      setDeletionStep(1);
      setDeletionConfirmation('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setDeletionSubmitError("We couldn't submit your deletion request. Please try again.");
    } finally {
      setDeletionSubmitting(false);
    }
  }, [deletionConfirmation, deletionSubmitting, getToken]);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSigningOut(true);
    try {
      await signOut();
      const { queryClient } = await import('@/lib/queryClient');
      queryClient.clear();
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  // ── Avatar ────────────────────────────────────────────────────────────────
  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || '?';

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member';

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Change Password Modal */}
      <Modal
        visible={pwModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setPwModalVisible(false); resetPwForm(); }}
      >
        <KeyboardAvoidingView
          style={[styles.modalWrap, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>CHANGE PASSWORD</Text>
            <TouchableOpacity onPress={() => { setPwModalVisible(false); resetPwForm(); }} hitSlop={12}>
              <SvgIcon name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CURRENT PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Enter current password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showCurrent}
                value={currentPw}
                onChangeText={setCurrentPw}
                autoCapitalize="none" autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowCurrent(v => !v)} hitSlop={8}>
                <SvgIcon name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>NEW PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showNew}
                value={newPw}
                onChangeText={setNewPw}
                autoCapitalize="none" autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={8}>
                <SvgIcon name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 20 }]}>CONFIRM NEW PASSWORD</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Repeat new password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                value={confirmPw}
                onChangeText={setConfirmPw}
                autoCapitalize="none" autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: colors.primary },
                (pwLoading || !currentPw || !newPw || !confirmPw) && { opacity: 0.4 },
              ]}
              onPress={handleChangePassword}
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              activeOpacity={0.8}
            >
              {pwLoading
                ? <ActivityIndicator color={colors.primaryForeground} />
                : <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>UPDATE PASSWORD</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account deletion request modal */}
      <Modal
        visible={deletionModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDeletionModal}
        onDismiss={() => {
          if (!deletionSubmitting) {
            setDeletionStep(1);
            setDeletionConfirmation('');
            setDeletionSubmitError('');
          }
        }}
      >
        <View style={[styles.deletionModalWrap, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.modalHeader,
              styles.deletionModalHeader,
              { borderBottomColor: colors.border, paddingTop: insets.top + 16 },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {deletionStep === 1 ? 'ACCOUNT DELETION' : 'CONFIRM REQUEST'}
            </Text>
            <TouchableOpacity
              onPress={closeDeletionModal}
              disabled={deletionSubmitting}
              hitSlop={12}
              testID="deletion-modal-close"
              accessibilityRole="button"
              accessibilityLabel="Cancel account deletion request"
            >
              <SvgIcon name="x" size={22} color={deletionSubmitting ? colors.muted : colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollViewCompat
            contentContainerStyle={[
              styles.deletionModalContent,
              { paddingBottom: insets.bottom + 28 },
            ]}
            bottomOffset={36}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.deletionModalIcon, { backgroundColor: colors.destructive + '18' }]}>
              <SvgIcon name="trash-2" size={25} color={colors.destructive} />
            </View>
            {deletionStep === 1 ? (
              <>
                <Text style={[styles.deletionModalHeading, { color: colors.foreground }]}>
                  Request account deletion
                </Text>
                <View style={styles.deletionCopyStack}>
                  <Text style={[styles.deletionModalBody, { color: colors.mutedForeground }]}>
                    You can request deletion of your FIT CLUB 15 account and associated personal information.
                  </Text>
                  <Text style={[styles.deletionModalBody, { color: colors.mutedForeground }]}>
                    Your account will not be deleted immediately. Fit Club must review and reconcile information held in our account and scheduling systems before completing the request.
                  </Text>
                  <Text style={[styles.deletionModalBody, { color: colors.mutedForeground }]}>
                    Some records may be retained where required or permitted by law or for legitimate business obligations.
                  </Text>
                  <Text style={[styles.deletionModalBody, { color: colors.mutedForeground }]}>
                    Deletion may take time to complete. We will send you confirmation when the process is complete.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.deletionPrimaryBtn, { backgroundColor: colors.destructive }]}
                  onPress={() => setDeletionStep(2)}
                  activeOpacity={0.8}
                  testID="deletion-continue"
                  accessibilityRole="button"
                  accessibilityLabel="Continue to confirm account deletion request"
                >
                  <Text style={[styles.deletionPrimaryBtnText, { color: colors.destructiveForeground }]}>
                    CONTINUE
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deletionCancelBtn}
                  onPress={closeDeletionModal}
                  disabled={deletionSubmitting}
                  activeOpacity={0.7}
                  testID="deletion-cancel"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel account deletion request"
                >
                  <Text style={[styles.deletionCancelBtnText, { color: colors.mutedForeground }]}>
                    CANCEL
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.deletionModalHeading, { color: colors.foreground }]}>
                  TYPE DELETE TO CONFIRM
                </Text>
                <Text style={[styles.deletionModalBody, { color: colors.mutedForeground }]}>
                  To submit your account deletion request, type DELETE exactly as shown below.
                </Text>
                <TextInput
                  style={[
                    styles.deletionInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.input,
                      borderColor: deletionConfirmation === 'DELETE' ? colors.destructive : colors.border,
                    },
                  ]}
                  value={deletionConfirmation}
                  onChangeText={setDeletionConfirmation}
                  placeholder="DELETE"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitDeletionRequest}
                  editable={!deletionSubmitting}
                  accessibilityLabel="Type DELETE to confirm account deletion request"
                  testID="deletion-confirmation-input"
                />
                {deletionSubmitError ? (
                  <View style={[styles.deletionErrorBox, { backgroundColor: colors.destructive + '12' }]}>
                    <SvgIcon name="alert-circle" size={17} color={colors.destructive} />
                    <Text style={[styles.deletionErrorText, { color: colors.destructive }]}>
                      {deletionSubmitError}
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.deletionPrimaryBtn,
                    { backgroundColor: colors.destructive },
                    (deletionSubmitting || deletionConfirmation !== 'DELETE') && styles.disabledBtn,
                  ]}
                  onPress={handleSubmitDeletionRequest}
                  disabled={deletionSubmitting || deletionConfirmation !== 'DELETE'}
                  activeOpacity={0.8}
                  testID="deletion-submit"
                  accessibilityRole="button"
                  accessibilityLabel="Submit account deletion request"
                  accessibilityState={{
                    disabled: deletionSubmitting || deletionConfirmation !== 'DELETE',
                    busy: deletionSubmitting,
                  }}
                >
                  {deletionSubmitting ? (
                    <ActivityIndicator size="small" color={colors.destructiveForeground} />
                  ) : (
                    <Text style={[styles.deletionPrimaryBtnText, { color: colors.destructiveForeground }]}>
                      {deletionSubmitError ? 'TRY AGAIN' : 'SUBMIT REQUEST'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deletionCancelBtn}
                  onPress={() => {
                    setDeletionStep(1);
                    setDeletionConfirmation('');
                    setDeletionSubmitError('');
                  }}
                  disabled={deletionSubmitting}
                  activeOpacity={0.7}
                  testID="deletion-back"
                  accessibilityRole="button"
                  accessibilityLabel="Go back to account deletion information"
                >
                  <Text style={[styles.deletionCancelBtnText, { color: colors.mutedForeground }]}>
                    BACK
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* ── Main scroll ───────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 16, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>PROFILE</Text>

        {/* ── Avatar card ─────────────────────────────────────────────────── */}
        <View style={[styles.avatarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '22', borderColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={[styles.avatarName, { color: colors.foreground }]}>{displayName}</Text>
            <Text style={[styles.avatarEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{email}</Text>
          </View>
        </View>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <SectionLabel title="ACCOUNT" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {nameEditingSupported === false ? (
            /* Clerk has name editing disabled for this app — show read-only display */
            <View style={styles.nameReadOnly}>
              <SvgIcon name="info" size={15} color={colors.mutedForeground} />
              <Text style={[styles.nameReadOnlyText, { color: colors.mutedForeground }]}>
                Your name is managed by your account provider and can't be edited here. Contact the studio to update it.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FIRST NAME</Text>
                  <TextInput
                    style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.nameField}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LAST NAME</Text>
                  <TextInput
                    style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input }]}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: nameDirty ? colors.primary : colors.muted },
                  (nameSaving || !nameDirty) && { opacity: 0.5 },
                ]}
                onPress={handleSaveName}
                disabled={!nameDirty || nameSaving}
                activeOpacity={0.8}
              >
                {nameSaving
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Text style={[styles.saveBtnText, { color: nameDirty ? colors.primaryForeground : colors.mutedForeground }]}>
                      SAVE NAME
                    </Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Preferred location ───────────────────────────────────────────── */}
        <SectionLabel title="PREFERRED LOCATION" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHint, { color: colors.mutedForeground }]}>
            Used to highlight your usual studio on the booking screen.
          </Text>
          {LOCATIONS.map((loc, i) => {
            const selected = prefLocation === loc.id;
            return (
              <TouchableOpacity
                key={loc.id}
                style={[
                  styles.optionRow,
                  i < LOCATIONS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                onPress={() => handleSelectLocation(loc.id)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.border },
                ]}>
                  {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.optionLabel, { color: selected ? colors.foreground : colors.mutedForeground }]}>
                  {loc.name}
                </Text>
                {selected && <SvgIcon name="map-pin" size={14} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Session reminders ────────────────────────────────────────────── */}
        <SectionLabel title="SESSION REMINDERS" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {NOTIF_OPTIONS.map((opt, i) => {
            const selected = notifTiming === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionRow,
                  styles.optionRowTall,
                  i < NOTIF_OPTIONS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                onPress={() => handleSelectNotifTiming(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.border },
                ]}>
                  {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <View style={styles.optionTextCol}>
                  <Text style={[styles.optionLabel, { color: selected ? colors.foreground : colors.mutedForeground }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[styles.reminderStatusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.reminderStatusTitle, { color: colors.foreground }]}>
            {reminderStatusCopy.title}
          </Text>
          <Text style={[styles.reminderStatusDetail, { color: colors.mutedForeground }]}>
            {reminderStatusCopy.detail}
          </Text>
        </View>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <SectionLabel title="SECURITY" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="key"
            label="Change Password"
            onPress={() => setPwModalVisible(true)}
            colors={colors}
          />
          {biometricHardware && (
            <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
              <SvgIcon name="fingerprint" size={18} color={colors.mutedForeground} />
              <Text style={[styles.settingLabel, { color: colors.foreground, flex: 1 }]}>
                Biometric Login
              </Text>
              {biometricToggling ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              )}
            </View>
          )}
        </View>

        {/* ── Legal ─────────────────────────────────────────────────────────── */}
        <SectionLabel title="LEGAL" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            icon="external-link"
            label="Privacy Policy"
            onPress={() => {
              WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL).catch(() => Linking.openURL(PRIVACY_POLICY_URL));
            }}
            colors={colors}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          />
        </View>

        {/* ── Account deletion ──────────────────────────────────────────────── */}
        <SectionLabel title="ACCOUNT DELETION" colors={colors} />
        <View
          style={[
            styles.deletionCard,
            {
              backgroundColor: colors.destructive + '0D',
              borderColor: colors.destructive + '66',
            },
          ]}
          testID="account-deletion-section"
        >
          {deletionStatus === 'loading' ? (
            <View style={styles.deletionStatusRow}>
              <ActivityIndicator size="small" color={colors.destructive} />
              <Text style={[styles.deletionStatusText, { color: colors.mutedForeground }]}>
                Checking request status…
              </Text>
            </View>
          ) : deletionStatus === 'error' ? (
            <View style={styles.deletionStatusStack}>
              <View style={styles.deletionStatusRow}>
                <SvgIcon name="alert-circle" size={18} color={colors.destructive} />
                <Text style={[styles.deletionStatusText, { color: colors.mutedForeground }]}>
                  {deletionStatusError}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deletionRetryBtn, { borderColor: colors.destructive + '66' }]}
                onPress={loadDeletionStatus}
                activeOpacity={0.75}
                testID="deletion-status-retry"
                accessibilityRole="button"
                accessibilityLabel="Retry checking account deletion request status"
              >
                <SvgIcon name="rotate-ccw" size={15} color={colors.destructive} />
                <Text style={[styles.deletionRetryText, { color: colors.destructive }]}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          ) : deletionRequest ? (
            <View style={styles.deletionStatusStack}>
              <View style={styles.deletionStatusRow}>
                <SvgIcon name="clock" size={18} color={colors.destructive} />
                <Text style={[styles.deletionPendingTitle, { color: colors.foreground }]}>
                  {deletionSuccess ? 'Deletion request received' : 'Deletion Request Pending'}
                </Text>
              </View>
              <Text style={[styles.deletionPendingText, { color: colors.mutedForeground }]}>
                {deletionSuccess
                  ? 'Your request has been submitted for review. Your FIT CLUB 15 account has not been deleted yet.\n\nSome records may be retained where required or permitted by law or for legitimate business obligations. We will send you confirmation when deletion is complete.'
                  : 'Your account deletion request has been submitted and is being reviewed. Your account has not been deleted yet. We will send you confirmation when the process is complete.'}
              </Text>
            </View>
          ) : (
            <View style={styles.deletionStatusStack}>
              <View style={styles.deletionStatusRow}>
                <SvgIcon name="trash-2" size={18} color={colors.destructive} />
                <Text style={[styles.deletionPendingTitle, { color: colors.foreground }]}>
                  REQUEST ACCOUNT DELETION
                </Text>
              </View>
              <Text style={[styles.deletionPendingText, { color: colors.mutedForeground }]}>
                Start a request to delete your account. Your account stays active until the Fit Club team reviews it.
              </Text>
              <TouchableOpacity
                style={[styles.deletionActionBtn, { backgroundColor: colors.destructive }]}
                onPress={openDeletionModal}
                activeOpacity={0.8}
                testID="request-account-deletion"
                accessibilityRole="button"
                accessibilityLabel="Request account deletion"
              >
                <Text style={[styles.deletionActionText, { color: colors.destructiveForeground }]}>
                  REQUEST DELETION
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Sign out ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.signOutBtn, { borderColor: colors.destructive + '66' }]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.8}
        >
          {signingOut
            ? <ActivityIndicator size="small" color={colors.destructive} />
            : <>
                <SvgIcon name="log-out" size={16} color={colors.destructive} />
                <Text style={[styles.signOutText, { color: colors.destructive }]}>SIGN OUT</Text>
              </>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  screenTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 3,
    marginBottom: 20,
  },

  // Avatar card
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 28,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 22,
    letterSpacing: 1,
  },
  avatarInfo: { flex: 1, gap: 3 },
  avatarName: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  avatarEmail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 4,
  },

  // Generic card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
  },
  cardHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    padding: 14,
    paddingBottom: 10,
  },

  // Name read-only notice
  nameReadOnly: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
  },
  nameReadOnlyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },

  // Name fields
  nameRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    paddingBottom: 4,
  },
  nameField: { flex: 1, gap: 6 },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  nameInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Save button
  saveBtn: {
    margin: 14,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 15,
    letterSpacing: 2,
  },

  // Option rows (location + notifications)
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionRowTall: { paddingVertical: 12 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    flex: 1,
  },
  optionTextCol: { flex: 1, gap: 2 },
  optionSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  reminderStatusCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: -12,
    marginBottom: 24,
    gap: 5,
  },
  reminderStatusTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  reminderStatusDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },

  // Account deletion
  deletionCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
    padding: 16,
  },
  deletionStatusStack: { gap: 12 },
  deletionCopyStack: { gap: 12 },
  deletionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deletionStatusText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  deletionPendingTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.4,
    flex: 1,
  },
  deletionPendingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  deletionActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 2,
  },
  deletionActionText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 15,
    letterSpacing: 1.6,
  },
  deletionRetryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deletionRetryText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 13,
    letterSpacing: 1.3,
  },

  // Setting rows (security)
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    flex: 1,
  },
  settingValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  signOutText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 15,
    letterSpacing: 1.5,
  },

  // Change password modal
  modalWrap: { flex: 1 },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },

  // Account deletion modal
  deletionModalWrap: { flex: 1 },
  deletionModalHeader: { paddingBottom: 16 },
  deletionModalContent: {
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  deletionModalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  deletionModalHeading: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 25,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  deletionModalBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  deletionInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    marginTop: 22,
  },
  deletionInfoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  deletionPrimaryBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    marginTop: 26,
  },
  deletionPrimaryBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 16,
    letterSpacing: 1.8,
  },
  deletionCancelBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 7,
  },
  deletionCancelBtnText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.6,
  },
  deletionInput: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    letterSpacing: 2,
    marginTop: 24,
  },
  deletionErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 9,
    padding: 12,
    marginTop: 14,
  },
  deletionErrorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  disabledBtn: { opacity: 0.4 },
});
