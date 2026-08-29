import assert from "node:assert/strict";
import test from "node:test";
import { getAcuityConfig } from "../config/acuity.js";
import {
  FIT_CLUB_PREFERENCES_METADATA_KEY,
  PREFERRED_LOCATION_METADATA_KEY,
  mergePreferredLocationMetadata,
  parsePreferredLocationKey,
  readPreferredLocationKey,
} from "./user-preferences.js";

const configuredLocations = getAcuityConfig().locations;

test("config exposes only the two canonical location keys", () => {
  assert.deepEqual(
    configuredLocations.map((location) => location.key),
    ["potomac", "kentlands"],
  );
});

test("accepts canonical configured keys and explicit null", () => {
  assert.deepEqual(parsePreferredLocationKey("potomac", configuredLocations), {
    ok: true,
    value: "potomac",
  });
  assert.deepEqual(parsePreferredLocationKey("kentlands", configuredLocations), {
    ok: true,
    value: "kentlands",
  });
  assert.deepEqual(parsePreferredLocationKey(null, configuredLocations), {
    ok: true,
    value: null,
  });
});

test("rejects every non-canonical preference value", () => {
  for (const value of [
    "1",
    "2",
    "Potomac",
    "KENTLANDS",
    "",
    undefined,
    false,
    1,
    {},
  ]) {
    assert.deepEqual(
      parsePreferredLocationKey(value, configuredLocations),
      { ok: false },
      `expected ${String(value)} to be rejected`,
    );
  }
});

test("merges the preference without overwriting unrelated public metadata", () => {
  const existing = {
    firstName: "Invited",
    lastName: "Member",
    unrelated: { keep: true },
    [FIT_CLUB_PREFERENCES_METADATA_KEY]: {
      unrelatedPreference: "keep-me",
      [PREFERRED_LOCATION_METADATA_KEY]: "kentlands",
    },
  };

  assert.deepEqual(
    mergePreferredLocationMetadata(existing, "potomac"),
    {
      firstName: "Invited",
      lastName: "Member",
      unrelated: { keep: true },
      [FIT_CLUB_PREFERENCES_METADATA_KEY]: {
        unrelatedPreference: "keep-me",
        [PREFERRED_LOCATION_METADATA_KEY]: "potomac",
      },
    },
  );
});

test("read returns null for never-set, cleared, and invalid stored values", () => {
  assert.equal(readPreferredLocationKey({}), null);
  assert.equal(
    readPreferredLocationKey({
      [FIT_CLUB_PREFERENCES_METADATA_KEY]: {
        [PREFERRED_LOCATION_METADATA_KEY]: null,
      },
    }),
    null,
  );
  assert.equal(
    readPreferredLocationKey({
      [FIT_CLUB_PREFERENCES_METADATA_KEY]: {
        [PREFERRED_LOCATION_METADATA_KEY]: "1",
      },
    }),
    null,
  );
});