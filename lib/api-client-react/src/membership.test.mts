import assert from "node:assert/strict";
import test from "node:test";
import {
  getAcuityMembershipCatalogUrl,
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