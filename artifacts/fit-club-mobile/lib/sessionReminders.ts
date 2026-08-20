export type NotifTiming = '24h' | '2h' | 'both' | 'off';

export type ReminderAppointment = {
  id: number;
  time: string;
  type: string;
};

export type SessionReminderStatus =
  | 'ready'
  | 'disabled'
  | 'permission-denied'
  | 'unavailable'
  | 'error';

type ScheduledNotification = {
  identifier: string;
  content: { data?: unknown };
};

export type SessionReminderNotifications = {
  setNotificationChannelAsync?: (
    channelId: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  AndroidImportance?: { HIGH?: unknown };
  getPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  getAllScheduledNotificationsAsync: () => Promise<ScheduledNotification[]>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<unknown>;
  scheduleNotificationAsync: (request: {
    content: {
      title: string;
      body: string;
      data: Record<string, unknown>;
      sound: boolean;
    };
    trigger: { type: unknown; date: Date };
  }) => Promise<unknown>;
  SchedulableTriggerInputTypes?: { DATE?: unknown };
};

export type SessionReminderRuntime = {
  platform: 'android' | 'ios' | 'web' | 'other';
  isRealBuild: boolean;
  permissionState: { current: boolean | null };
  loadNotifications: () => Promise<{
    notifications: SessionReminderNotifications;
    isDevice: boolean;
  }>;
};

const REMINDER_KIND = 'session-reminder';
const CHANNEL_ID = 'session-reminders';

const ADVANCE_BY_TIMING: Record<Exclude<NotifTiming, 'off'>, number[]> = {
  '24h': [24 * 60],
  '2h': [2 * 60],
  both: [24 * 60, 2 * 60],
};

let latestRun = 0;

function isOurReminder(notification: ScheduledNotification): boolean {
  return (
    (notification.content.data as Record<string, unknown> | undefined)?.kind ===
    REMINDER_KIND
  );
}

async function cancelExistingReminders(
  notifications: SessionReminderNotifications,
): Promise<void> {
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter(isOurReminder);
  await Promise.all(
    ours.map((notification) =>
      notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
}

/**
 * Rebuilds only Fit Club's local session reminders.
 *
 * The run token prevents a slower previous rebuild from scheduling stale
 * reminders after a newer preference change has started.
 */
export async function rescheduleSessionReminders(
  appointments: ReminderAppointment[],
  timing: NotifTiming,
  runtime: SessionReminderRuntime,
): Promise<SessionReminderStatus | 'stale'> {
  const run = ++latestRun;
  const isCurrent = () => run === latestRun;

  if (runtime.platform === 'web' || !runtime.isRealBuild) {
    return 'unavailable';
  }

  let notifications: SessionReminderNotifications;
  let isDevice: boolean;
  try {
    ({ notifications, isDevice } = await runtime.loadNotifications());
  } catch {
    return 'unavailable';
  }

  if (!isCurrent()) return 'stale';

  try {
    if (runtime.platform === 'android') {
      await notifications.setNotificationChannelAsync?.(CHANNEL_ID, {
        name: 'Session Reminders',
        importance: notifications.AndroidImportance?.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C8FA5F',
      });
    }

    if (!isCurrent()) return 'stale';

    // Always remove our old reminders first. This makes Off immediate and
    // prevents stale/duplicate reminders when timing changes.
    await cancelExistingReminders(notifications);

    if (!isCurrent()) return 'stale';
    if (timing === 'off') return 'disabled';

    if (runtime.permissionState.current === null) {
      if (!isDevice && runtime.platform === 'android') {
        runtime.permissionState.current = false;
      } else {
        const existing = await notifications.getPermissionsAsync();
        if (existing.granted) {
          runtime.permissionState.current = true;
        } else {
          const requested = await notifications.requestPermissionsAsync();
          runtime.permissionState.current = requested.granted;
        }
      }
    }

    if (!isCurrent()) return 'stale';
    if (!runtime.permissionState.current) return 'permission-denied';

    const advanceMinutes = ADVANCE_BY_TIMING[timing];
    const now = Date.now();
    const triggerType = notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';

    for (const appointment of appointments) {
      const sessionMs = new Date(appointment.time).getTime();

      for (const minutes of advanceMinutes) {
        if (!isCurrent()) return 'stale';

        const triggerMs = sessionMs - minutes * 60 * 1000;
        if (triggerMs <= now) continue;

        const label =
          minutes >= 60 * 20
            ? `${Math.round(minutes / 60)} hours`
            : `${minutes} minutes`;

        await notifications.scheduleNotificationAsync({
          content: {
            title: '💪 Session Reminder',
            body: `Your ${appointment.type} starts in ${label}. See you there!`,
            data: {
              kind: REMINDER_KIND,
              appointmentId: appointment.id,
              route: 'appointments',
            },
            sound: true,
          },
          trigger: {
            type: triggerType,
            date: new Date(triggerMs),
          },
        });
      }
    }

    return isCurrent() ? 'ready' : 'stale';
  } catch {
    return isCurrent() ? 'error' : 'stale';
  }
}