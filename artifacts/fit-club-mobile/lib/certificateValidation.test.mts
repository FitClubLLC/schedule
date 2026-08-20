import assert from "node:assert/strict";
import test from "node:test";
import { isAuthoritativeCertificateInvalidStatus } from "./certificateValidation.ts";

test("transient certificate-validation failures preserve a saved code", () => {
  for (const status of [undefined, 0, 401, 400, 500, 502, 503, 504]) {
    assert.equal(isAuthoritativeCertificateInvalidStatus(status), false);
  }
});

test("an authoritative invalid-certificate response clears a saved code", () => {
  assert.equal(isAuthoritativeCertificateInvalidStatus(422), true);
});