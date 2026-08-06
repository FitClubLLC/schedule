/**
 * useSessionReminders
 *
 * Schedules local push notifications 60 minutes before each upcoming session.
 * Uses dynamic imports for expo-notifications so that the module failing to load
 * in Expo Go (SDK 53+) doesn't crash the whole app — it silently skips instead.
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NOTIF_TIMING_KEY, DEFAULT_NOTIF_TIMING, type NotifTiming } from '@/lib/notificationPrefs';

/** True when running as a real device build (EAS / production). False in Expo Go. */
const IS_REAL_BUILD = Constants.appOwnership !== 'expo';

const REMINDER_KIND = 'session-reminder';
const CHANNEL_ID = 'session-reminders';

/** Minutes before each session to schedule a reminder for each timing mode. */
const ADVANCE_BY_TIMING: Record<Exclude<NotifTiming, 'off'>, number[]> = {
  '24h':  [24 * 60],
  '2h':   [2 * 60],
  'both': [24 * 60, 2 * 60],
};

function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export type ReminderAppointment = {
  id: number;
  time: string;
  type: string;
};

export function useSessionReminders(appointments: ReminderAppointment[] | undefined) {
  const permGranted = useRef<boolean | null>(null);

  const apptKey = appointments
    ?.slice()
    .sort((a, b) => a.id - b.id)
    .map((a) => `${a.id}:${a.time}:${a.type}`)
    .join('|') ?? '';

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!IS_REAL_BUILD) return; // expo-notifications throws in Expo Go (SDK 53+)
    if (appointments === undefined) return;

    const appts = appointments;
    let cancelled = false;

    async function schedule() {
      // Dynamic import — if expo-notifications isn't available (e.g. Expo Go SDK 53+)
      // this throws and we catch it below, silently skipping notifications.
      let Notifications: typeof import('expo-notifications');
      let Device: typeof import('expo-device');
      try {
        Notifications = await import('expo-notifications');
        Device = await import('expo-device');
      } catch {
        // Running in Expo Go or an environment without notification support — skip silently.
        return;
      }

      if (cancelled) return;

      // Set up Android channel.
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Session Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#C8FA5F',
        });
      }

      // Request permission (result cached for the lifetime of the hook).
      if (permGranted.current === null) {
        if (!Device.isDevice && Platform.OS === 'android') {
          permGranted.current = false;
        } else {
          const existing = (await Notifications.getPermissionsAsync()) as unknown as { granted: boolean };
          if (existing.granted) {
            permGranted.current = true;
          } else {
            const requested = (await Notifications.requestPermissionsAsync()) as unknown as { granted: boolean };
            permGranted.current = requested.granted;
          }
        }
      }

      if (!permGranted.current || cancelled) return;

      // Cancel all previously scheduled session reminders before rescheduling.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const ours = scheduled.filter(
        (n) => (n.content.data as Record<string, unknown>)?.kind === REMINDER_KIND,
      );
      await Promise.all(
        ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
      );

      if (cancelled) return;

      // Read the member's preferred timing from AsyncStorage.
      const rawTiming = await AsyncStorage.getItem(NOTIF_TIMING_KEY);
      const timing: NotifTiming =
        rawTiming === '24h' || rawTiming === '2h' || rawTiming === 'both' || rawTiming === 'off'
          ? rawTiming
          : DEFAULT_NOTIF_TIMING;

      // 'off' — cancellation already done above; just exit.
      if (timing === 'off' || cancelled) return;

      const advanceMinutes = ADVANCE_BY_TIMING[timing];
      const now = Date.now();

      for (const appt of appts) {
        const sessionMs = new Date(appt.time).getTime();

        for (const mins of advanceMinutes) {
          const triggerMs = sessionMs - mins * 60 * 1000;
          if (triggerMs <= now) continue;

          const label = mins >= 60 * 20
            ? `${Math.round(mins / 60)} hours`
            : `${mins} minutes`;

          await Notifications.scheduleNotificationAsync({
            content: {
              title: '💪 Session Reminder',
              body: `Your ${appt.type} starts in ${label}. See you there!`,
              data: {
                kind: REMINDER_KIND,
                appointmentId: appt.id,
                route: 'appointments',
              },
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(triggerMs),
            },
          });
        }
      }
    }

    schedule();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptKey]);
}
