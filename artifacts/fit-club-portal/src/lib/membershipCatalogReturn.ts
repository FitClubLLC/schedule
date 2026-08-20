import {
  scheduleMembershipCertificateFollowUps,
  type ScheduleRefresh,
} from "@workspace/api-client-react";

export const PORTAL_MEMBER_CERTIFICATES_QUERY_KEY = ["booking", "certificates"] as const;
const MEMBERSHIP_CATALOG_RETURN_KEY = "fitclub-membership-catalog-opened";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function markMembershipCatalogOpened(storage: StorageLike = window.sessionStorage): void {
  storage.setItem(MEMBERSHIP_CATALOG_RETURN_KEY, "1");
}

export function consumeMembershipCatalogReturn(storage: StorageLike = window.sessionStorage): boolean {
  const opened = storage.getItem(MEMBERSHIP_CATALOG_RETURN_KEY) === "1";
  if (opened) storage.removeItem(MEMBERSHIP_CATALOG_RETURN_KEY);
  return opened;
}

export function schedulePortalCertificateRefreshes(
  refresh: () => void,
  schedule?: ScheduleRefresh,
): void {
  scheduleMembershipCertificateFollowUps(refresh, schedule);
}

/**
 * Keep a newly consumed credit aligned with Acuity's normal propagation delay.
 * This is not purchase confirmation and does not poll indefinitely.
 */
export function refreshPortalCertificatesAfterBooking(
  invalidate: () => void,
  refetch: () => void,
  schedule?: ScheduleRefresh,
): void {
  invalidate();
  schedulePortalCertificateRefreshes(refetch, schedule);
}