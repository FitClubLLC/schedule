import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS } from "@workspace/api-client-react";
import { scheduleMobileCatalogCertificateRefreshes } from "./membershipRefresh.ts";

test("Mobile post-booking refresh uses a bounded Acuity propagation schedule", () => {
  const scheduled: number[] = [];
  const callbacks: Array<() => void> = [];
  let refreshes = 0;
  scheduleMobileCatalogCertificateRefreshes(
    () => {
      refreshes += 1;
    },
    (callback, delayMs) => {
      scheduled.push(delayMs);
      callbacks.push(callback);
    },
  );

  assert.deepEqual(scheduled, [...MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS]);
  callbacks.forEach((callback) => callback());
  assert.equal(refreshes, MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS.length);
});