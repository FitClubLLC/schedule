import assert from "node:assert/strict";
import test from "node:test";
import type { AcuityConfig } from "../config/acuity.js";
import {
  certificateBalanceState,
  configuredAppointmentTypeIds,
  formatCertificateRemaining,
  validateLocationService,
} from "./booking-eligibility.js";

const config: AcuityConfig = {
  ownerId: "owner",
  appointmentTypes: {
    workoutFor1: "workout",
    redLightTherapy: "red-light",
    freeTrial: "trial",
  },
  termsAcknowledgement: { formId: "form", fieldId: "field" },
  locations: [
    {
      id: "1",
      name: "POTOMAC",
      calendarId: "calendar-1",
      appointmentTypeIDs: ["workout"],
    },
    {
      id: "2",
      name: "KENTLANDS",
      calendarId: "calendar-2",
      appointmentTypeIDs: ["workout", "red-light"],
    },
  ],
};

test("rejects explicitly exhausted dollar-value and session-count certificates", () => {
  assert.equal(certificateBalanceState({ remainingValue: "0.00" }), "empty");
  assert.equal(certificateBalanceState({ remainingValue: "-5" }), "empty");
  assert.equal(certificateBalanceState({ remainingCounts: { workout: 0, redLight: 0 } }), "empty");
});

test("recognizes usable certificate balances and leaves balance-less codes for Acuity to validate", () => {
  assert.equal(certificateBalanceState({ remainingValue: "15.00" }), "positive");
  assert.equal(certificateBalanceState({ remainingCounts: { workout: 0, redLight: 2 } }), "positive");
  assert.equal(certificateBalanceState({}), "unknown");
  assert.equal(
    formatCertificateRemaining({ remainingCounts: { workout: 2, redLight: 2 } }),
    "2 sessions",
  );
});

test("uses one configured location/service rule for every booking stage", () => {
  assert.deepEqual(configuredAppointmentTypeIds(config), ["workout", "red-light"]);
  assert.equal(validateLocationService(config, "1", "workout").ok, true);

  const incompatible = validateLocationService(config, "1", "red-light");
  assert.deepEqual(incompatible, {
    ok: false,
    status: 422,
    error: "That service is not available at the selected location.",
  });

  const missing = validateLocationService(config, "999", "workout");
  assert.deepEqual(missing, {
    ok: false,
    status: 400,
    error: "Location 999 is not configured",
  });
});