import assert from "node:assert/strict";
import test from "node:test";
import type { AcuityConfig } from "../config/acuity.js";
import {
  certificateBalanceState,
  configuredAppointmentTypeIds,
  formatCertificateRemaining,
  nativeBookingRequiresCertificate,
  validateLocationService,
} from "./booking-eligibility.js";

// ── Test fixture — mirrors production defaults ────────────────────────────────

const config: AcuityConfig = {
  ownerId: "owner",
  appointmentTypes: {
    workoutFor1:     "workout",
    redLightTherapy: "red-light",
    freeTrial:       "trial",
  },
  termsAcknowledgement: { formId: "form", fieldId: "field" },
  locations: [
    {
      key: "potomac",
      id: "1",
      name: "POTOMAC",
      calendarId: "cal-potomac",
      services: [
        {
          key: "external-free-trial-1",
          appointmentTypeID: "trial",
          name: "Free Trial",
          bookingMode: "external",
          calendarId: "cal-potomac",
          requiresCertificate: false,
        },
        {
          key: "native-workout-1",
          appointmentTypeID: "workout",
          name: "Workout for 1",
          bookingMode: "native",
          calendarId: "cal-potomac",
          requiresCertificate: false,
        },
      ],
      appointmentTypeIDs: ["workout"],
    },
    {
      key: "kentlands",
      id: "2",
      name: "KENTLANDS",
      calendarId: "cal-kentlands",
      services: [
        {
          key: "external-free-trial-2",
          appointmentTypeID: "trial",
          name: "Free Trial",
          bookingMode: "external",
          calendarId: "cal-kentlands",
          requiresCertificate: false,
        },
        {
          key: "native-workout-2",
          appointmentTypeID: "workout",
          name: "Workout for 1",
          bookingMode: "native",
          calendarId: "cal-kentlands",
          requiresCertificate: false,
        },
        {
          key: "native-red-light-2",
          appointmentTypeID: "red-light",
          name: "Red Light Therapy Session",
          bookingMode: "native",
          calendarId: "cal-red-light",
          requiresCertificate: true,
        },
      ],
      appointmentTypeIDs: ["workout", "red-light"],
    },
  ],
};

// ── Certificate balance ───────────────────────────────────────────────────────

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

// ── configuredAppointmentTypeIds — native only ────────────────────────────────

test("configuredAppointmentTypeIds returns only native type IDs, excluding Free Trial", () => {
  const ids = configuredAppointmentTypeIds(config);
  // Free Trial is external — must not appear
  assert.ok(!ids.includes("trial"), "Free Trial must not appear in native type IDs");
  // Both native types across both locations
  assert.ok(ids.includes("workout"), "workout must appear");
  assert.ok(ids.includes("red-light"), "red-light must appear");
  assert.equal(ids.length, 2);
});

test("requires a certificate for native Workout for 1 and configured certificate-gated services", () => {
  const workout = config.locations[0].services.find(
    (service) => service.appointmentTypeID === "workout",
  )!;
  const redLight = config.locations[1].services.find(
    (service) => service.appointmentTypeID === "red-light",
  )!;

  assert.equal(
    nativeBookingRequiresCertificate(workout, config.appointmentTypes.workoutFor1),
    true,
  );
  assert.equal(
    nativeBookingRequiresCertificate(redLight, config.appointmentTypes.workoutFor1),
    true,
  );
});

// ── validateLocationService — matrix correctness ──────────────────────────────

test("validates Potomac Workout for 1 as native", () => {
  const result = validateLocationService(config, "1", "workout");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.service.bookingMode, "native");
  assert.equal(result.service.calendarId, "cal-potomac");
});

test("validates Kentlands Workout for 1 as native using Kentlands main calendar", () => {
  const result = validateLocationService(config, "2", "workout");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.service.bookingMode, "native");
  assert.equal(result.service.calendarId, "cal-kentlands");
});

test("validates Kentlands Red Light Therapy as native using its own distinct calendar", () => {
  const result = validateLocationService(config, "2", "red-light");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.service.bookingMode, "native");
  // Red Light must use the separate calendar, not the main Kentlands calendar
  assert.equal(result.service.calendarId, "cal-red-light");
  assert.notEqual(result.service.calendarId, "cal-kentlands");
});

test("rejects Red Light Therapy at Potomac (not configured there)", () => {
  const result = validateLocationService(config, "1", "red-light");
  assert.deepEqual(result, {
    ok: false,
    status: 422,
    error: "That service is not available at the selected location.",
  });
});

test("rejects Free Trial through native validation (external-only service)", () => {
  // Free Trial must never pass the native validator regardless of location
  const atPotomac = validateLocationService(config, "1", "trial");
  assert.equal(atPotomac.ok, false);
  if (atPotomac.ok) throw new Error("unreachable");
  assert.equal(atPotomac.status, 422);

  const atKentlands = validateLocationService(config, "2", "trial");
  assert.equal(atKentlands.ok, false);
  if (atKentlands.ok) throw new Error("unreachable");
  assert.equal(atKentlands.status, 422);
});

test("rejects unknown location", () => {
  const result = validateLocationService(config, "999", "workout");
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Location 999 is not configured",
  });
});

// ── Service matrix completeness ────────────────────────────────────────────────

test("Potomac service list contains Free Trial (external) and Workout for 1 (native) only", () => {
  const potomac = config.locations.find((l) => l.id === "1")!;
  const external = potomac.services.filter((s) => s.bookingMode === "external");
  const native   = potomac.services.filter((s) => s.bookingMode === "native");

  assert.equal(external.length, 1, "Potomac must have exactly one external service");
  assert.equal(external[0].appointmentTypeID, "trial");

  assert.equal(native.length, 1, "Potomac must have exactly one native service");
  assert.equal(native[0].appointmentTypeID, "workout");

  // No Red Light at Potomac
  assert.ok(!potomac.services.some((s) => s.appointmentTypeID === "red-light"));
});

test("Kentlands service list contains Free Trial, Workout for 1, and Red Light Therapy", () => {
  const kentlands = config.locations.find((l) => l.id === "2")!;
  const external = kentlands.services.filter((s) => s.bookingMode === "external");
  const native   = kentlands.services.filter((s) => s.bookingMode === "native");

  assert.equal(external.length, 1, "Kentlands must have exactly one external service");
  assert.equal(external[0].appointmentTypeID, "trial");

  assert.equal(native.length, 2, "Kentlands must have two native services");
  const nativeIds = native.map((s) => s.appointmentTypeID);
  assert.ok(nativeIds.includes("workout"));
  assert.ok(nativeIds.includes("red-light"));
});

test("Workout for 2 is absent from all locations", () => {
  for (const loc of config.locations) {
    assert.ok(
      !loc.services.some((s) => /workout.*2|for.?2/i.test(s.name)),
      `Location ${loc.name} must not have Workout for 2`,
    );
  }
});
