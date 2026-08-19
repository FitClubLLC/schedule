/**
 * Type-only descriptions of the Acuity response fields consumed by the API.
 *
 * These models intentionally do not parse or normalize upstream responses.
 * Runtime validation and response mapping remain in the route handlers.
 */

export interface AcuityAppointmentResponse {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  datetime?: string | null;
  time?: string | null;
  endTime?: string | null;
  duration?: number | string | null;
  type?: string | null;
  calendar?: string | null;
  calendarID?: number | string | null;
  appointmentTypeID?: number | string | null;
  location?: string | null;
  notes?: string | null;
  confirmationPage?: string | null;
}

export type AcuityAppointmentListResponse = AcuityAppointmentResponse[];

export interface AcuityRescheduleResponse {
  datetime?: string | null;
  message?: string;
  error?: string;
}

export interface AcuityCreatedAppointmentResponse {
  id: number;
  type?: string | null;
  date?: string | null;
  datetime?: string | null;
  calendar?: string | null;
  location?: string | null;
  confirmationPage?: string | null;
}