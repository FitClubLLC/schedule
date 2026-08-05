import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetUpcomingAppointmentsQueryKey,
  getGetPastAppointmentsQueryKey,
  getGetAppointmentSummaryQueryKey,
} from '@workspace/api-client-react';

export interface TimeSlot {
  time: string;
  datetime: string;
}

export function useAppointmentActions() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  async function authFetch(path: string, options: RequestInit = {}): Promise<any> {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPastAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() });
    // Also refresh the session count on the Book page — cancellations return
    // a session to the member's package and the count must update immediately.
    queryClient.invalidateQueries({ queryKey: ['member-certificates'] });
  }

  async function cancelAppointment(id: number): Promise<void> {
    await authFetch(`/api/appointments/${id}`, { method: 'DELETE' });
    invalidateAll();
  }

  async function fetchAvailableTimes(id: number, date: string): Promise<TimeSlot[]> {
    return authFetch(`/api/appointments/${id}/times?date=${date}`);
  }

  async function rescheduleAppointment(id: number, datetime: string): Promise<void> {
    await authFetch(`/api/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ datetime }),
    });
    invalidateAll();
  }

  return { cancelAppointment, fetchAvailableTimes, rescheduleAppointment };
}
