import assert from "node:assert/strict";
import test from "node:test";
import {
  getAcuitySchedulerUrl,
  getAcuityMembershipCatalogUrl,
  getCreditBookingDecision,
  getPackageLoadState,
  MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS,
  scheduleMembershipCertificateFollowUps,
} from "./membership.ts";

test("package state keeps a failed request distinct from an empty package list", () => {
  assert.equal(getPackageLoadState({ isLoading: true, isError: false, itemCount: 0 }), "loading");
  assert.equal(getPackageLoadState({ isLoading: false, isError: false, itemCount: 2 }), "ready");
  assert.equal(getPackageLoadState({ isLoading: false, isError: false, itemCount: 0 }), "empty");
  assert.equal(getPackageLoadState({ isLoading: false, isError: true, itemCount: 0 }), "error");
});

test("membership catalog destination is derived from the configured Acuity owner", () => {
  assert.equal(
    getAcuityMembershipCatalogUrl("36930698"),
    "https://app.acuityscheduling.com/catalog.php?owner=36930698",
  );
});

test("membership refresh follow-ups are bounded", () => {
  const scheduled: number[] = [];
  scheduleMembershipCertificateFollowUps(
    () => undefined,
    (_callback, delayMs) => scheduled.push(delayMs),
  );

  assert.deepEqual(scheduled, [...MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS]);
});

test("uses a selected eligible Workout for 1 credit for native booking", () => {
  const decision = getCreditBookingDecision({
    appointmentTypeId: "83398355",
    selectedCertificateCode: "MEMBER-4",
    certificates: [{
      code: "MEMBER-4",
      productName: "Membership — One Session Per Week",
      appointmentTypeIDs: ["83398355"],
    }],
  });

  assert.deepEqual(decision, { kind: "native", certificateCode: "MEMBER-4" });
});

test("returns every active credit for selection without inspecting private product names", () => {
  const decision = getCreditBookingDecision({
    appointmentTypeId: "83398355",
    certificates: [
      {
        code: "SPOUSE-CREDIT",
        productName: "Private Partner Household Plan",
        appointmentTypeIDs: ["83398355"],
      },
      {
        code: "PROMO-CREDIT",
        productName: "August Community Thank You",
        appliesToAllProducts: true,
      },
    ],
  });

  assert.deepEqual(decision, {
    kind: "choose-credit",
    certificateCodes: ["SPOUSE-CREDIT", "PROMO-CREDIT"],
  });
});

test("uses the Acuity hosted payment path when no Workout for 1 credit exists", () => {
  const decision = getCreditBookingDecision({
    appointmentTypeId: "83398355",
    certificates: [{
      code: "RED-LIGHT-ONLY",
      productName: "Red Light Package",
      appointmentTypeIDs: ["96690076"],
    }],
  });

  assert.deepEqual(decision, { kind: "hosted-payment" });
});

test("builds a location-scoped Workout for 1 Acuity URL without a certificate", () => {
  const url = new URL(getAcuitySchedulerUrl({
    ownerId: "36930698",
    appointmentTypeId: "83398355",
    calendarId: "14311114",
    email: "member@example.com",
  }));

  assert.equal(url.origin, "https://app.acuityscheduling.com");
  assert.equal(url.pathname, "/schedule.php");
  assert.equal(url.searchParams.get("owner"), "36930698");
  assert.equal(url.searchParams.get("appointmentType"), "83398355");
  assert.equal(url.searchParams.get("calendarID"), "14311114");
  assert.equal(url.searchParams.get("email"), "member@example.com");
  assert.equal(url.searchParams.has("certificate"), false);
});