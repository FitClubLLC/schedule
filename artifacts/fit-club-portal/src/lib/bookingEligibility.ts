import type { MemberCertificate, CertificateCheckResult } from "@/hooks/useBookingApi";

/**
 * Returns the subset of locationNativeTypeIds the signed-in member is eligible
 * to book through the native flow.
 *
 * This function operates only on native appointment type IDs (external services
 * such as Free Trial are shown unconditionally by the UI and must not be passed
 * to this filter).
 *
 * Eligibility rules:
 *
 * All types require the member to have an active certificate that covers them.
 * Workout for 1 is rendered separately by the service selector because it has
 * a paid Acuity-hosted fallback when no credit is available.
 *
 * A qualifying certificate has:
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
  locationNativeTypeIds: string[],
  workoutFor1Id: string,
  memberCerts: MemberCertificate[],
  certCheck?: Pick<CertificateCheckResult, "productIDs" | "appliesToAllProducts"> | null,
): string[] {
  return locationNativeTypeIds.filter((typeId) => {
    // 1. Member has an active cert in their account that covers this type.
    if (
      memberCerts.some(
        (c) => c.appliesToAllProducts || c.appointmentTypeIDs.includes(typeId),
      )
    ) return true;

    // 2. Member entered a code manually and the check result covers this type.
    if (
      certCheck &&
      (certCheck.appliesToAllProducts || certCheck.productIDs.includes(typeId))
    ) return true;

    return false;
  });
}
