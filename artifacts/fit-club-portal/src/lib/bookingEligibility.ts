import type { MemberCertificate, CertificateCheckResult } from "@/hooks/useBookingApi";

/**
 * Returns the subset of locationTypeIds the signed-in member is eligible to book.
 *
 * Eligibility rules (applied in order):
 *
 *  1. workoutFor1Id is ALWAYS included — the base session service requires no
 *     certificate.
 *
 *  2. All other types (e.g. Red Light Therapy) require the member to have an
 *     active certificate that covers them:
 *       - cert.appliesToAllProducts === true  (general membership), OR
 *       - typeId appears in cert.appointmentTypeIDs (member-cert list) /
 *         certCheck.productIDs (manually-entered code check result).
 *
 * This function controls only what the UI presents. The backend/Acuity
 * remains the authoritative validator at booking time — do not remove or
 * weaken server-side checks in exchange for client-side filtering.
 *
 * NOTE: The mobile equivalent lives in
 * artifacts/fit-club-mobile/app/(tabs)/book/index.tsx (getEligibleTypeIds).
 * Both derive eligibility from the same backend configuration and certificate
 * data. Keep them in sync if the business rules change.
 */
export function getEligibleTypeIds(
  locationTypeIds: string[],
  workoutFor1Id: string,
  memberCerts: MemberCertificate[],
  certCheck?: Pick<CertificateCheckResult, "productIDs" | "appliesToAllProducts"> | null,
): string[] {
  return locationTypeIds.filter((typeId) => {
    // 1. Workout for 1 — always visible, no certificate required.
    if (typeId === workoutFor1Id) return true;

    // 2a. Member has an active cert in their account that covers this type.
    if (
      memberCerts.some(
        (c) => c.appliesToAllProducts || c.appointmentTypeIDs.includes(typeId),
      )
    ) return true;

    // 2b. Member entered a code manually and the check result covers this type.
    if (
      certCheck &&
      (certCheck.appliesToAllProducts || certCheck.productIDs.includes(typeId))
    ) return true;

    return false;
  });
}
