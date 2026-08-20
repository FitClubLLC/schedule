import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS } from "@workspace/api-client-react";
import { scheduleMobileCatalogCertificateRefreshes } from "./membershipRefresh.ts";

test("Mobile post-catalog refresh uses a bounded Acuity propagation schedule", () => {
  const scheduled: number[] = [];
  scheduleMobileCatalogCertificateRefreshes(
    () => undefined,
    (_callback, delayMs) => scheduled.push(delayMs),
  );

  assert.deepEqual(scheduled, [...MEMBERSHIP_CERTIFICATE_REFRESH_DELAYS_MS]);
});