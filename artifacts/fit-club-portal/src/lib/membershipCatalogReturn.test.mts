import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS } from "@workspace/api-client-react";
import {
  consumeMembershipCatalogReturn,
  markMembershipCatalogOpened,
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