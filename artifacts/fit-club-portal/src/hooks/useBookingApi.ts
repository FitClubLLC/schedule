import { useQuery, useMutation } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AcuityConfig {
  ownerId: string;
  appointmentTypes: {
    workoutFor1: string;
    redLightTherapy: string;
    freeTrial: string;
  };
  locations: Array<{
    id: string;
    name: string;
    calendarId: string;
  }>;
}

export interface BookingLocation {
  id: string;
  name: string;
}

export interface AppointmentType {
  id: number;
  name: string;
  duration: number;
  price: string;
  description?: string | null;
  category?: string | null;
}

export interface AvailableTime {
  time: string; // ISO 8601 datetime
  slotsAvailable: number;
}

export interface CreatedAppointment {
  id: number;
  type: string;
  date: string;
  time: string;
  calendar: string;
  location?: string | null;
  confirmationPage?: string | null;
}

export interface BookingPayload {
  locationId: string;
  appointmentTypeID: number;
  datetime: string;
  // The backend derives identity from the Clerk session and ignores these
  // client-submitted fields. They remain optional here for type compatibility.
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  certificate?: string;
}

export interface MemberCertificate {
  code: string;
  productName: string;
  remainingValue: string;
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
// Cookies are automatically sent for same-origin requests — no auth header needed.
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useAcuityConfig() {
  return useQuery({
    queryKey: ["booking", "config"],
    queryFn: () => apiFetch<AcuityConfig>("/api/booking/config"),
    staleTime: 10 * 60_000,
  });
}

export function useBookingLocations() {
  return useQuery({
    queryKey: ["booking", "locations"],
    queryFn: () => apiFetch<BookingLocation[]>("/api/booking/locations"),
    staleTime: 5 * 60_000,
  });
}

export function useAppointmentTypes(enabled = true) {
  return useQuery({
    queryKey: ["booking", "appointment-types"],
    queryFn: () => apiFetch<AppointmentType[]>("/api/booking/appointment-types"),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useAvailableDates(
  params: { locationId: string; appointmentTypeID: number; month: string } | null,
) {
  return useQuery({
    queryKey: ["booking", "dates", params],
    queryFn: () => {
      if (!params) return [] as string[];
      const q = new URLSearchParams({
        locationId: params.locationId,
        appointmentTypeID: String(params.appointmentTypeID),
        month: params.month,
      });
      return apiFetch<string[]>(`/api/booking/availability/dates?${q}`);
    },
    enabled: !!params,
    staleTime: 2 * 60_000,
  });
}

export function useAvailableTimes(
  params: { locationId: string; appointmentTypeID: number; date: string } | null,
) {
  return useQuery({
    queryKey: ["booking", "times", params],
    queryFn: () => {
      if (!params) return [] as AvailableTime[];
      const q = new URLSearchParams({
        locationId: params.locationId,
        appointmentTypeID: String(params.appointmentTypeID),
        date: params.date,
      });
      return apiFetch<AvailableTime[]>(`/api/booking/availability/times?${q}`);
    },
    enabled: !!params,
    staleTime: 60_000,
  });
}

export function useCreateBooking() {
  return useMutation({
    mutationFn: (payload: BookingPayload) =>
      apiFetch<CreatedAppointment>("/api/booking/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useMemberCertificates() {
  return useQuery({
    queryKey: ["booking", "certificates"],
    queryFn: () => apiFetch<MemberCertificate[]>("/api/booking/certificates"),
    staleTime: 5 * 60_000,
  });
}

export function useCertificateCheck(code: string) {
  return useQuery({
    queryKey: ["booking", "certificate-check", code],
    queryFn: () =>
      apiFetch<{ valid: boolean; productName: string; remainingValue: string }>(
        `/api/booking/certificates/check?certificate=${encodeURIComponent(code)}`,
      ),
    enabled: code.trim().length > 0,
    staleTime: 2 * 60_000,
    retry: false,
  });
}
