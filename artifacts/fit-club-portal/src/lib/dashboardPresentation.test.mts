import assert from "node:assert/strict";
import test from "node:test";
import {
  getDashboardDataState,
  getPortalWorkoutMemberships,
} from "./dashboardPresentation.ts";

const workoutTypeId = "83398355";

test("Portal dashboard preserves dynamic names and multiple eligible memberships", () => {
  const memberships = getPortalWorkoutMemberships(
    [
      {
        code: "PRIVATE-1",
        productName: "Private Household Membership",
        remainingValue: "4 sessions",
        appointmentTypeIDs: [workoutTypeId],
      },
      {
        code: "PROMO-1",
        productName: "August Promotional Credit",
        remainingValue: "2 sessions",
        appliesToAllProducts: true,
      },
      {
        code: "RED-LIGHT-1",
        productName: "Red Light Package",
        remainingValue: "3 sessions",
        appointmentTypeIDs: ["96690076"],
      },
    ],
    workoutTypeId,
  );

  assert.deepEqual(
    memberships.map(({ productName, remainingValue }) => ({
      productName,
      remainingValue,
    })),
    [
      {
        productName: "Private Household Membership",
        remainingValue: "4 sessions",
      },
      {
        productName: "August Promotional Credit",
        remainingValue: "2 sessions",
      },
    ],
  );
});

test("Dashboard data states keep errors distinct from successful empty data", () => {
  assert.equal(
    getDashboardDataState({ isLoading: true, isError: false }),
    "loading",
  );
  assert.equal(
    getDashboardDataState({ isLoading: false, isError: true }),
    "error",
  );
  assert.equal(
    getDashboardDataState({ isLoading: false, isError: false }),
    "ready",
  );
});