import type { SessionReminderStatus } from './sessionReminders';

export type SessionReminderUiStatus = SessionReminderStatus | 'checking';

export function getSessionReminderStatusCopy(status: SessionReminderUiStatus): {
  title: string;
  detail: string;
} {
  switch (status) {
    case 'ready':
      return {
        title: 'Local reminders are active on this device.',
        detail:
          'These reminders are device-local only. They do not control Acuity email/SMS, Clerk security messages, payment receipts, or Portal notifications.',
      };
    case 'disabled':
      return {
        title: 'Local session reminders are off.',
        detail:
          'These settings apply only to this device. Acuity email/SMS, Clerk security messages, payment receipts, and Portal notifications are not changed.',
      };
    case 'permission-denied':
      return {
        title: 'Device notifications are turned off.',
        detail:
          'Enable notifications in your device settings to receive local session reminders. The app will not repeatedly prompt you.',
      };
    case 'unavailable':
      return {
        title: 'Local reminders are unavailable here.',
        detail:
          'These reminders require a supported native app build and apply only to this device. Acuity email/SMS, Clerk security messages, payment receipts, and Portal notifications are separate.',
      };
    case 'error':
      return {
        title: 'Local reminders could not be updated.',
        detail:
          'Your preference is saved on this device. Try again later; this does not change Acuity, Clerk, payment, or Portal notifications.',
      };
    case 'checking':
      return {
        title: 'Checking local reminder status…',
        detail:
          'These are device-local appointment reminders and do not control Acuity email/SMS, Clerk security messages, payment receipts, or Portal notifications.',
      };
  }
}