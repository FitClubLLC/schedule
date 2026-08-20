import type { SessionReminderStatus } from '@/lib/sessionReminders';

export type ReminderAppointment = {
  id: number;
  time: string;
  type: string;
};

export function useSessionReminders(
  _appointments: ReminderAppointment[] | undefined,
  _timingOverride?: '24h' | '2h' | 'both' | 'off',
): SessionReminderStatus | 'checking' {
  return 'unavailable';
}