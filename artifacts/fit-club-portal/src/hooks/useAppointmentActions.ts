import { useQueryClient } from "@tanstack/react-query";
import {
  getGetUpcomingAppointmentsQueryKey,
  getGetPastAppointmentsQueryKey,
  getGetAppointmentSummaryQueryKey,
} from "@workspace/api-client-react";

export interface TimeSlot {
  time: string;
  datetime: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useAppointmentActions() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPastAppointmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAppointmentSummaryQueryKey() });
  }

  async function cancelAppointment(id: number): Promise<void> {
    await apiFetch(`/api/appointments/${id}`, { method: "DELETE" });
    invalidateAll();
  }

  async function fetchAvailableTimes(id: number, date: string): Promise<TimeSlot[]> {
    return apiFetch<TimeSlot[]>(`/api/appointments/${id}/times?date=${date}`);
  }

  async function rescheduleAppointment(id: number, datetime: string): Promise<void> {
    await apiFetch(`/api/appointments/${id}`, {
      method: "PUT",
      body: JSON.stringify({ datetime }),
    });
    invalidateAll();
  }

  return { cancelAppointment, fetchAvailableTimes, rescheduleAppointment };
}
