import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rescheduleSessionReminders,
  type SessionReminderNotifications,
  type SessionReminderRuntime,
} from './sessionReminders.ts';
import {
  DEFAULT_NOTIF_TIMING,
  NOTIF_TIMING_KEY,
} from './notificationPrefs.ts';
import { getSessionReminderStatusCopy } from './sessionReminderPresentation.ts';

type FakeNotification = {
  identifier: string;
  content: { data?: unknown };
  trigger?: { type: unknown; date: Date };
};

function createRuntime(options?: {
  permissionGranted?: boolean;
  isDevice?: boolean;
  initial?: FakeNotification[];
}) {
  const scheduled = [...(options?.initial ?? [])];
  const cancelled: string[] = [];
  const requested: number[] = [];
  const runtimePermission = {
    current: null as boolean | null,
  };
  let nextId = scheduled.length + 1;

  const notifications: SessionReminderNotifications = {
    AndroidImportance: { HIGH: 'high' },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => ({
      granted: options?.permissionGranted ?? true,
    }),
    requestPermissionsAsync: async () => {
      requested.push(1);
      return { granted: options?.permissionGranted ?? true };
    },
    getAllScheduledNotificationsAsync: async () => [...scheduled],
    cancelScheduledNotificationAsync: async (identifier) => {
      cancelled.push(identifier);
      const index = scheduled.findIndex((notification) => notification.identifier === identifier);
      if (index >= 0) scheduled.splice(index, 1);
    },
    scheduleNotificationAsync: async (request) => {
      const identifier = `new-${nextId++}`;
      scheduled.push({ identifier, content: request.content, trigger: request.trigger });
      return identifier;
    },
  };

  const runtime: SessionReminderRuntime = {
    platform: 'ios',
    isRealBuild: true,
    permissionState: runtimePermission,
    loadNotifications: async () => ({
      notifications,
      isDevice: options?.isDevice ?? true,
    }),
  };

  return { runtime, scheduled, cancelled, requested };
}

const futureAppointment = {
  id: 101,
  time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  type: 'Workout for 1',
};

test('Both → Off cancels all existing Fit Club reminders immediately', async () => {
  const fake = createRuntime({
    initial: [
      { identifier: 'fit-1', content: { data: { kind: 'session-reminder' } } },
      { identifier: 'other-1', content: { data: { kind: 'other' } } },
    ],
  });

  const status = await rescheduleSessionReminders(
    [futureAppointment],
    'off',
    fake.runtime,
  );

  assert.equal(status, 'disabled');
  assert.deepEqual(fake.cancelled, ['fit-1']);
  assert.deepEqual(
    fake.scheduled.map((notification) => notification.identifier),
    ['other-1'],
  );
});

test('changing timing replaces prior schedules without duplicates', async () => {
  const fake = createRuntime();

  assert.equal(
    await rescheduleSessionReminders([futureAppointment], 'both', fake.runtime),
    'ready',
  );
  assert.equal(fake.scheduled.length, 2);

  assert.equal(
    await rescheduleSessionReminders([futureAppointment], '2h', fake.runtime),
    'ready',
  );
  assert.equal(fake.cancelled.length, 2);
  assert.equal(fake.scheduled.length, 1);
  assert.equal(fake.scheduled[0]?.trigger?.date.getTime(),
    new Date(futureAppointment.time).getTime() - 2 * 60 * 60 * 1000);
});

test('permission denied is visible through a stable status without repeated prompts', async () => {
  const fake = createRuntime({ permissionGranted: false });

  assert.equal(
    await rescheduleSessionReminders([futureAppointment], '24h', fake.runtime),
    'permission-denied',
  );
  assert.equal(
    await rescheduleSessionReminders([futureAppointment], '24h', fake.runtime),
    'permission-denied',
  );
  assert.equal(fake.requested.length, 1);
  assert.equal(fake.scheduled.length, 0);
});

test('denied and unavailable states provide safe device-local Profile guidance', () => {
  const denied = getSessionReminderStatusCopy('permission-denied');
  const unavailable = getSessionReminderStatusCopy('unavailable');

  assert.match(denied.detail, /device settings/i);
  assert.match(denied.detail, /not repeatedly prompt/i);
  assert.match(unavailable.detail, /device/i);
  assert.match(unavailable.detail, /Acuity email\/SMS/i);
  assert.match(unavailable.detail, /Portal notifications/i);
});

test('unsupported runtime returns unavailable without scheduling', async () => {
  const fake = createRuntime();
  fake.runtime.isRealBuild = false;

  assert.equal(
    await rescheduleSessionReminders([futureAppointment], DEFAULT_NOTIF_TIMING, fake.runtime),
    'unavailable',
  );
  assert.equal(fake.scheduled.length, 0);
});

test('reminder preference remains device-local with the existing key and default', () => {
  assert.equal(NOTIF_TIMING_KEY, '@fitclub/notification-timing');
  assert.equal(DEFAULT_NOTIF_TIMING, 'both');
});