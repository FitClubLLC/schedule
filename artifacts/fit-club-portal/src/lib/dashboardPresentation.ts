import {
  getEligibleCertificatesForAppointmentType,
  type CertificateAppointmentEligibility,
} from "@workspace/api-client-react";

export type DashboardDataState = "loading" | "error" | "ready";

export function getDashboardDataState(input: {
  isLoading: boolean;
  isError: boolean;
}): DashboardDataState {
  if (input.isError) return "error";
  if (input.isLoading) return "loading";
  return "ready";
}

export interface PortalMemberCertificate extends CertificateAppointmentEligibility {
  productName: string;
  remainingValue: string;
}

export function getPortalWorkoutMemberships(
  certificates: PortalMemberCertificate[],
  workoutAppointmentTypeId: string,
): PortalMemberCertificate[] {
  return getEligibleCertificatesForAppointmentType(
    certificates,
    workoutAppointmentTypeId,
  );
}