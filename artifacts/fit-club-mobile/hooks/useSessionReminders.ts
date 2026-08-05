/**
 * useSessionReminders
 *
 * Schedules local push notifications 60 minutes before each upcoming session.
 * Notifications include the session type, start time, and a deep link to the
 * Appointments tab so members can tap through directly.
 *
 * Works entirely on-device — no server-side job needed.
 * Silently does nothing on web (expo-notifications is iOS/Android only).
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

/** Marker stored in each notification's data payload so we can cancel only ours. */
const REMINDER_KIND = 'session-reminder';

/** How many minutes before a session to fire the reminder. */
const ADVANCE_MINUTES = 60;

/** Android notification channel id/name. */
const CHANNEL_ID = 'session-reminders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Session Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C8FA5F',
  });
}

async function requestPermissions(): Promise<boolean> {
  // Local notifications work on iOS simulator; Android simulator support is limited.
  if (!Device.isDevice && Platform.OS === 'android') return false;

  // Cast via unknown: the PermissionResponse 'granted' field isn't resolved in this
  // monorepo's TS config, but it is present at runtime per the expo-notifications docs.
  const existing = (await Notifications.getPermissionsAsync()) as unknown as { granted: boolean };
  if (existing.granted) return true;

  const requested = (await Notifications.requestPermissionsAsync()) as unknown as { granted: boolean };
  return requested.granted;
}

/** Cancel only the session-reminder notifications we previously scheduled. */
async function cancelExistingReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter(
    (n) => (n.content.data as Record<string, unknown>)?.kind === REMINDER_KIND,
  );
  await Promise.all(
    ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Format a date as "9:00 AM". */
function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type ReminderAppointment = {
  id: number;
  time: string; // ISO 8601
  type: string;
};

/**
 * Call this hook with the list of upcoming appointments fetched from the API.
 * It will request notification permission on first run, then cancel any
 * previously scheduled reminders and reschedule one per upcoming session.
 *
 * Re-runs automatically whenever appointment IDs, times, or types change —
 * covering bookings, cancellations, and reschedules of the same appointment.
 * When the list is empty (all sessions cancelled) existing reminders are cleared.
 */
export function useSessionReminders(appointments: ReminderAppointment[] | undefined) {
  const permGranted = useRef<boolean | null>(null);

  // Cache key includes id + time + type so the effect re-fires on reschedules
  // (same ID, different time) and on appointment type changes, not just add/remove.
  const apptKey = appointments
    ?.slice()
    .sort((a, b) => a.id - b.id)
    .map((a) => `${a.id}:${a.time}:${a.type}`)
    .join('|') ?? '';

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Do NOT return early for an empty list — we must still cancel any
    // previously scheduled reminders so stale notifications don't fire
    // after a member cancels all upcoming sessions.
    if (appointments === undefined) return;

    // Capture into a const so TypeScript's narrowing holds inside the async closure.
    const appts = appointments;
    let cancelled = false; // guard against stale async runs

    async function schedule() {
      // One-time permission request (result is cached in the ref).
      if (permGranted.current === null) {
        await ensureAndroidChannel();
        permGranted.current = await requestPermissions();
      }
      if (!permGranted.current || cancelled) return;

      // Cancel ALL previously scheduled session reminders before rescheduling.
      // This handles: cancellations, reschedules, and the empty-list case.
      await cancelExistingReminders();
      if (cancelled) return;

      const now = Date.now();

      for (const appt of appts) {
        const sessionMs = new Date(appt.time).getTime();
        const triggerMs = sessionMs - ADVANCE_MINUTES * 60 * 1000;

        // Don't schedule a notification that would fire in the past.
        if (triggerMs <= now) continue;

        const timeStr = fmtTime(appt.time);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '💪 Session Reminder',
            body: `Your ${appt.type} starts at ${timeStr}. See you there!`,
            data: {
              kind: REMINDER_KIND,
              appointmentId: appt.id,
              // Deep link the tap handler uses to navigate.
              url: 'fitclub15:///appointments',
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

    schedule();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptKey]);
}
