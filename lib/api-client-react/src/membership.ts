/**
 * Shared membership/package presentation helpers.
 *
 * Acuity remains the authoritative source for package data. These helpers
 * only keep client presentation and the external catalog destination aligned.
 */

export type PackageLoadState = "loading" | "ready" | "empty" | "error";

export function getPackageLoadState(input: {
  isLoading: boolean;
  isError: boolean;
  itemCount: number;
}): PackageLoadState {
  if (input.isError) return "error";
  if (input.isLoading) return "loading";
  return input.itemCount > 0 ? "ready" : "empty";
}

export function getAcuityMembershipCatalogUrl(ownerId: string): string {
  return `https://app.acuityscheduling.com/catalog.php?owner=${encodeURIComponent(ownerId)}`;
}

/**
 * Acuity can take a few seconds to expose a newly purchased package or a
 * restored package credit. These are deliberately bounded follow-ups, not
 * purchase confirmation and not indefinite polling.
 */
export const MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS = [4_000, 8_000] as const;

export type ScheduleRefresh = (callback: () => void, delayMs: number) => unknown;

export function scheduleMembershipCertificateFollowUps(
  refresh: () => void,
  schedule: ScheduleRefresh = (callback, delayMs) => setTimeout(callback, delayMs),
): void {
  MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS.forEach((delayMs) => {
    schedule(refresh, delayMs);
  });
}