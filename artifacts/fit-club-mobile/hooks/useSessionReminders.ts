import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NOTIF_TIMING_KEY,
  DEFAULT_NOTIF_TIMING,
  type NotifTiming,
} from '@/lib/notificationPrefs';
import {
  rescheduleSessionReminders,
  type ReminderAppointment,
  type SessionReminderNotifications,
  type SessionReminderRuntime,
  type SessionReminderStatus,
} from '@/lib/sessionReminders';

/** True when running as a real device build (EAS / production). */
const IS_REAL_BUILD = Constants.appOwnership !== 'expo';
const permissionState = { current: null as boolean | null };

const runtime: SessionReminderRuntime = {
  platform:
    Platform.OS === 'android' || Platform.OS === 'ios'
      ? Platform.OS
      : Platform.OS === 'web'
        ? 'web'
        : 'other',
  isRealBuild: IS_REAL_BUILD,
  permissionState,
  loadNotifications: async () => {
    const notifications = await import('expo-notifications');
    const device = await import('expo-device');
    return {
      notifications: notifications as unknown as SessionReminderNotifications,
      isDevice: device.isDevice,
    };
  },
};

function isNotifTiming(value: string | null): value is NotifTiming {
  return value === '24h' || value === '2h' || value === 'both' || value === 'off';
}

export function useSessionReminders(
  appointments: ReminderAppointment[] | undefined,
  timingOverride?: NotifTiming,
): SessionReminderStatus | 'checking' {
  const [status, setStatus] = useState<SessionReminderStatus | 'checking'>(
    'checking',
  );

  const apptKey =
    appointments
      ?.slice()
      .sort((a, b) => a.id - b.id)
      .map((appointment) => `${appointment.id}:${appointment.time}:${appointment.type}`)
      .join('|') ?? '';

  useEffect(() => {
    if (Platform.OS === 'web' || !IS_REAL_BUILD) {
      setStatus('unavailable');
      return;
    }
    if (appointments === undefined) {
      setStatus('checking');
      return;
    }

    const currentAppointments = appointments;
    let active = true;

    async function rebuild() {
      try {
        const storedTiming = await AsyncStorage.getItem(NOTIF_TIMING_KEY);
        const timing =
          timingOverride ??
          (isNotifTiming(storedTiming) ? storedTiming : DEFAULT_NOTIF_TIMING);
        const nextStatus = await rescheduleSessionReminders(
          currentAppointments,
          timing,
          runtime,
        );
        if (active && nextStatus !== 'stale') {
          setStatus(nextStatus);
        }
      } catch {
        if (active) setStatus('error');
      }
    }

    void rebuild();
    return () => {
      active = false;
    };
    // apptKey includes every appointment field used to create reminders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptKey, timingOverride]);

  return status;
}