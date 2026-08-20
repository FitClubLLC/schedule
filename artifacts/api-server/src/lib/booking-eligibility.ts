import type { AcuityConfig, AcuityLocation, AcuityService } from "../config/acuity.js";

export type CertificateBalanceState = "positive" | "empty" | "unknown";

export interface AcuityCertificateBalance {
  remainingValue?: unknown;
  remainingCounts?: unknown;
}

export type LocationServiceValidation =
  | { ok: true; location: AcuityLocation; service: AcuityService }
  | { ok: false; status: 400 | 422; error: string };

function positiveNumber(value: unknown): boolean {
  const numberValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) && numberValue > 0;
}

/**
 * Determines whether Acuity explicitly reports usable value for a certificate.
 * `unknown` is reserved for valid codes such as coupons where Acuity does not
 * return a remaining-balance field; those are validated by /certificates/check.
 */
export function certificateBalanceState(
  certificate: AcuityCertificateBalance,
): CertificateBalanceState {
  if (certificate.remainingValue !== null && certificate.remainingValue !== undefined) {
    return positiveNumber(certificate.remainingValue) ? "positive" : "empty";
  }

  if (certificate.remainingCounts && typeof certificate.remainingCounts === "object") {
    const counts = Object.values(certificate.remainingCounts as Record<string, unknown>);
    return counts.some(positiveNumber) ? "positive" : "empty";
  }

  return "unknown";
}

export function formatCertificateRemaining(certificate: AcuityCertificateBalance): string {
  if (certificate.remainingValue !== null && certificate.remainingValue !== undefined) {
    return String(certificate.remainingValue);
  }

  if (certificate.remainingCounts && typeof certificate.remainingCounts === "object") {
    const values = Object.values(certificate.remainingCounts as Record<string, unknown>)
      .map((value) => (typeof value === "number" ? value : Number(value)))
      .filter(Number.isFinite);
    const total = Math.max(0, ...values);
    return `${total} session${total !== 1 ? "s" : ""}`;
  }

  return "0";
}

/**
 * Returns all native appointment type IDs across all locations.
 * Used for certificate eligibility checks — Free Trial (external) is excluded.
 */
export function configuredAppointmentTypeIds(config: AcuityConfig): string[] {
  return [
    ...new Set(
      config.locations.flatMap((location) =>
        location.services
          .filter((service) => service.bookingMode === "native")
          .map((service) => service.appointmentTypeID),
      ),
    ),
  ];
}

/**
 * Workout for 1 is normally a paid Acuity appointment, so its native route is
 * permitted only when a selected Acuity certificate is present. Other native
 * services preserve their configured certificate requirement.
 */
export function nativeBookingRequiresCertificate(
  service: AcuityService,
  workoutFor1AppointmentTypeId: string,
): boolean {
  return service.requiresCertificate ||
    service.appointmentTypeID === workoutFor1AppointmentTypeId;
}

/**
 * Applies the location/service rule shared by availability and final booking.
 * Only native services are accepted — external (Free Trial) must never reach
 * native availability or appointment creation.
 * Client filtering improves the experience, but this guard remains authoritative.
 */
export function validateLocationService(
  config: AcuityConfig,
  locationId: string,
  appointmentTypeId: string,
): LocationServiceValidation {
  const location = config.locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    return {
      ok: false,
      status: 400,
      error: `Location ${locationId} is not configured`,
    };
  }

  const service = location.services.find(
    (candidate) =>
      candidate.appointmentTypeID === appointmentTypeId &&
      candidate.bookingMode === "native",
  );
  if (!service) {
    return {
      ok: false,
      status: 422,
      error: "That service is not available at the selected location.",
    };
  }

  return { ok: true, location, service };
}
