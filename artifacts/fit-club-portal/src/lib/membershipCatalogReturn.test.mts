import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS } from "@workspace/api-client-react";
import {
  consumeMembershipCatalogReturn,
  markMembershipCatalogOpened,
  refreshPortalCertificatesAfterBooking,
  schedulePortalCertificateRefreshes,
} from "./membershipCatalogReturn.ts";

function createStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

test("Portal refreshes package data only after a catalog return was recorded", () => {
  const storage = createStorage();
  assert.equal(consumeMembershipCatalogReturn(storage), false);
  markMembershipCatalogOpened(storage);
  assert.equal(consumeMembershipCatalogReturn(storage), true);
  assert.equal(consumeMembershipCatalogReturn(storage), false);
});

test("Portal post-return and post-cancellation refreshes are bounded", () => {
  const scheduled: number[] = [];
  schedulePortalCertificateRefreshes(
    () => undefined,
    (_callback, delayMs) => scheduled.push(delayMs),
  );

  assert.deepEqual(scheduled, [...MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS]);
});

test("Portal post-booking refresh immediately invalidates and then refetches on a bounded schedule", () => {
  const scheduled: Array<() => void> = [];
  let invalidations = 0;
  let refetches = 0;

  refreshPortalCertificatesAfterBooking(
    () => {
      invalidations += 1;
    },
    () => {
      refetches += 1;
    },
    (callback) => {
      scheduled.push(callback);
    },
  );

  assert.equal(invalidations, 1);
  assert.equal(refetches, 0);
  assert.equal(scheduled.length, MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS.length);
  scheduled.forEach((callback) => callback());
  assert.equal(refetches, MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS.length);
});