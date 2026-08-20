import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMembershipBalance,
  getWorkoutBookingAction,
  getWorkoutMemberships,
  isWorkoutBookingActionUnavailable,
  WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE,
} from "./membershipPresentation.ts";

const workoutTypeId = "83398355";

test("Home keeps dynamic private membership names and remaining sessions", () => {
  const memberships = getWorkoutMemberships(
    [
      {
        code: "PRIVATE-1",
        productName: "Private Household Membership",
        remainingValue: "4 sessions",
        appointmentTypeIDs: [workoutTypeId],
      },
      {
        code: "RED-LIGHT-1",
        productName: "Red Light Package",
        remainingValue: "2 sessions",
        appointmentTypeIDs: ["96690076"],
      },
    ],
    workoutTypeId,
  );

  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].productName, "Private Household Membership");
  assert.equal(formatMembershipBalance(memberships[0].remainingValue), "4 sessions remaining");
});

test("Home supports multiple active Workout memberships", () => {
  const memberships = getWorkoutMemberships(
    [
      {
        code: "WEEKLY",
        productName: "Weekly Membership",
        remainingValue: "1 session",
        appointmentTypeIDs: [workoutTypeId],
      },
      {
        code: "PROMO",
        productName: "August Promotional Credit",
        remainingValue: "3 sessions",
        appliesToAllProducts: true,
      },
    ],
    workoutTypeId,
  );

  assert.deepEqual(
    memberships.map((membership) => membership.productName),
    ["Weekly Membership", "August Promotional Credit"],
  );
});

test("zero eligible Workout credits uses the Acuity-hosted payment path", () => {
  assert.deepEqual(
    getWorkoutBookingAction({
      packageIsLoading: false,
      packageIsError: false,
      selectedCertificateIsLoading: false,
      selectedCertificateIsError: false,
      certificates: [],
      workoutAppointmentTypeId: workoutTypeId,
    }),
    { kind: "hosted-payment" },
  );
});

test("pending and failed package states cannot masquerade as no credit", () => {
  assert.deepEqual(
    getWorkoutBookingAction({
      packageIsLoading: true,
      packageIsError: false,
      selectedCertificateIsLoading: false,
      selectedCertificateIsError: false,
      certificates: [],
      workoutAppointmentTypeId: workoutTypeId,
    }),
    { kind: "loading" },
  );
  assert.deepEqual(
    getWorkoutBookingAction({
      packageIsLoading: false,
      packageIsError: true,
      selectedCertificateIsLoading: false,
      selectedCertificateIsError: false,
      certificates: [],
      workoutAppointmentTypeId: workoutTypeId,
    }),
    { kind: "error" },
  );
});

test("credits exist with none selected shows a clear unavailable choose-membership state", () => {
  const input = {
    packageIsLoading: false,
    packageIsError: false,
    selectedCertificateIsLoading: false,
    selectedCertificateIsError: false,
    certificates: [{
      code: "MEMBER-1",
      productName: "Member Package",
      remainingValue: "2 sessions",
      appointmentTypeIDs: [workoutTypeId],
    }],
    workoutAppointmentTypeId: workoutTypeId,
  };

  const action = getWorkoutBookingAction(input);
  assert.deepEqual(action, {
    kind: "choose-credit",
    certificateCodes: ["MEMBER-1"],
  });
  assert.equal(
    WORKOUT_CHOOSE_MEMBERSHIP_MESSAGE,
    "Select one of your active memberships above to book this session.",
  );
  assert.equal(isWorkoutBookingActionUnavailable(action), true);
});

test("selected eligible credit uses native booking", () => {
  const input = {
    packageIsLoading: false,
    packageIsError: false,
    selectedCertificateIsLoading: false,
    selectedCertificateIsError: false,
    certificates: [{
      code: "MEMBER-1",
      productName: "Member Package",
      remainingValue: "2 sessions",
      appointmentTypeIDs: [workoutTypeId],
    }],
    workoutAppointmentTypeId: workoutTypeId,
  };

  assert.deepEqual(
    getWorkoutBookingAction({ ...input, selectedCertificateCode: "MEMBER-1" }),
    { kind: "native", certificateCode: "MEMBER-1" },
  );
  assert.equal(
    isWorkoutBookingActionUnavailable(
      getWorkoutBookingAction({ ...input, selectedCertificateCode: "MEMBER-1" }),
    ),
    false,
  );
});