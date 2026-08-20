import {
  getCreditBookingDecision,
  getEligibleCertificatesForAppointmentType,
  type CreditBookingDecision,
} from "@workspace/api-client-react";

export interface MobileMemberCertificate {
  code: string;
  productName: string;
  remainingValue: string;
  appointmentTypeIDs?: string[];
  appliesToAllProducts?: boolean;
}

export const WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE =
  "Select one of your active memberships above to book this session.";

export function getWorkoutMemberships(
  certificates: MobileMemberCertificate[],
  workoutAppointmentTypeId: string,
): MobileMemberCertificate[] {
  return getEligibleCertificatesForAppointmentType(
    certificates,
    workoutAppointmentTypeId,
  );
}

export function formatMembershipBalance(remainingValue: string): string {
  const value = remainingValue.trim();
  if (!value) return "Balance unavailable";
  return /\bremaining\b/i.test(value) ? value : `${value} remaining`;
}

export type WorkoutBookingAction =
  | { kind: "loading" }
  | { kind: "error" }
  | CreditBookingDecision;

export function isWorkoutBookingActionUnavailable(
  action: WorkoutBookingAction,
): boolean {
  return action.kind === "error" || action.kind === "choose-credit";
}

export function getWorkoutBookingAction(input: {
  packageIsLoading: boolean;
  packageIsError: boolean;
  selectedCertificateIsLoading: boolean;
  selectedCertificateIsError: boolean;
  certificates: MobileMemberCertificate[];
  workoutAppointmentTypeId: string;
  selectedCertificateCode?: string;
}): WorkoutBookingAction {
  if (
    input.packageIsLoading ||
    input.selectedCertificateIsLoading
  ) {
    return { kind: "loading" };
  }

  if (
    input.packageIsError ||
    input.selectedCertificateIsError
  ) {
    return { kind: "error" };
  }

  return getCreditBookingDecision({
    certificates: input.certificates,
    appointmentTypeId: input.workoutAppointmentTypeId,
    selectedCertificateCode: input.selectedCertificateCode,
  });
}