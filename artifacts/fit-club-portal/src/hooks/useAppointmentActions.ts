import { useQueryClient } from "@tanstack/react-query";
import {
  getGetUpcomingAppointmentsQueryKey,
  getGetPastAppointmentsQueryKey,
  getGetAppointmentSummaryQueryKey,
  MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS,
} from "@workspace/api-client-react";
import { PORTAL_MEMBER_CERTIFICATES_QUERY_KEY } from "@/lib/membershipCatalogReturn";

export interface TimeSlot {
  time: string; // ISO datetime string from Acuity (e.g. "2026-08-10T09:00:00-0400")
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

  function refreshCertificates() {
    queryClient.invalidateQueries({ queryKey: PORTAL_MEMBER_CERTIFICATES_QUERY_KEY });
  }

  async function cancelAppointment(id: number): Promise<void> {
    await apiFetch(`/api/appointments/${id}`, { method: "DELETE" });
    invalidateAll();
    refreshCertificates();
    // Acuity restores package credit asynchronously. These bounded refreshes
    // retain Acuity as the source of truth without indefinite polling.
    MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS.forEach((delayMs) => {
      setTimeout(refreshCertificates, delayMs);
    });
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
