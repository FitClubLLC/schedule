import type { AcuityConfig, AcuityLocation } from "../config/acuity.js";

export type CertificateBalanceState = "positive" | "empty" | "unknown";

export interface AcuityCertificateBalance {
  remainingValue?: unknown;
  remainingCounts?: unknown;
}

export type LocationServiceValidation =
  | { ok: true; location: AcuityLocation }
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

export function configuredAppointmentTypeIds(config: AcuityConfig): string[] {
  return [...new Set(config.locations.flatMap((location) => location.appointmentTypeIDs))];
}

/**
 * Applies the location/service rule shared by availability and final booking.
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

  if (!location.appointmentTypeIDs.includes(appointmentTypeId)) {
    return {
      ok: false,
      status: 422,
      error: "That service is not available at the selected location.",
    };
  }

  return { ok: true, location };
}