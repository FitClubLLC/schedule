import assert from "node:assert/strict";
import test from "node:test";
import {
  APPOINTMENTS_LOAD_ERROR_DESCRIPTION,
  APPOINTMENTS_LOAD_ERROR_TITLE,
  CANCELLATION_ERROR_MESSAGE,
  getAppointmentListState,
} from "./appointmentStates.ts";

test("keeps a failed appointment request separate from an empty schedule", () => {
  assert.equal(
    getAppointmentListState({ isLoading: false, isError: true, count: 0 }),
    "error",
  );
  assert.equal(
    getAppointmentListState({ isLoading: false, isError: false, count: 0 }),
    "empty",
  );
  assert.equal(
    getAppointmentListState({ isLoading: true, isError: false, count: 0 }),
    "loading",
  );
  assert.equal(
    getAppointmentListState({ isLoading: false, isError: false, count: 1 }),
    "ready",
  );
});

test("provides clear non-sensitive appointment failure feedback", () => {
  assert.match(APPOINTMENTS_LOAD_ERROR_TITLE, /appointments/i);
  assert.match(APPOINTMENTS_LOAD_ERROR_DESCRIPTION, /try again/i);
  assert.match(CANCELLATION_ERROR_MESSAGE, /cancel/i);
  assert.doesNotMatch(CANCELLATION_ERROR_MESSAGE, /status|fetch|api|acuity/i);
});