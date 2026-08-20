import {
  scheduleMembershipCertificateFollowUps,
  type ScheduleRefresh,
} from "@workspace/api-client-react";

export const MEMBER_CERTIFICATES_QUERY_KEY = ["member-certificates"] as const;

/**
 * Schedules two bounded post-catalog refetch opportunities. It does not infer
 * that a purchase happened; Acuity remains authoritative when a query runs.
 */
export function scheduleMobileCatalogCertificateRefreshes(
  refresh: () => void,
  schedule?: ScheduleRefresh,
): void {
  scheduleMembershipCertificateFollowUps(refresh, schedule);
}