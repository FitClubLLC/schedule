import assert from "node:assert/strict";
import test from "node:test";
import { formatStudioTime, studioHour } from "./studioTime.ts";

test("renders Acuity offset timestamps in Eastern Time", () => {
  const acuityDatetime = "2026-08-20T15:20:00-0400";

  assert.equal(formatStudioTime(acuityDatetime), "3:20 PM");
  assert.equal(studioHour(acuityDatetime), 15);
});

test("renders the same studio clock regardless of the source timezone offset", () => {
  assert.equal(formatStudioTime("2026-08-20T15:20:00-0400"), "3:20 PM");
  assert.equal(formatStudioTime("2026-08-20T15:20:00-0700"), "6:20 PM");
});