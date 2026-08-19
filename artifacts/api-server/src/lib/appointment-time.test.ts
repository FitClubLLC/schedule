import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentStudioDate,
  parseAcuityDateTime,
  partitionAppointmentsByEasternTime,
  studioDateKey,
} from "./appointment-time.js";

test("uses the Eastern calendar date during the evening UTC boundary", () => {
  const now = new Date("2026-08-19T23:30:00.000Z"); // 7:30 PM Eastern
  assert.equal(studioDateKey(now), "2026-08-19");

  const sessions = [
    { id: "before", date: "2026-08-19", time: "2026-08-19T22:45:00.000Z" },
    { id: "after", date: "2026-08-19", time: "2026-08-20T00:15:00.000Z" },
  ];
  const partition = partitionAppointmentsByEasternTime(sessions, now);

  assert.deepEqual(partition.upcoming.map((session) => session.id), ["after"]);
  assert.deepEqual(partition.past.map((session) => session.id), ["before"]);
  assert.equal(appointmentStudioDate("2026-08-20T00:15:00.000Z"), "2026-08-19");
});

test("classifies spring-forward appointments by their real instant", () => {
  const now = new Date("2026-03-08T07:00:00.000Z"); // 3:00 AM EDT
  const sessions = [
    { id: "before-dst", date: "2026-03-08", time: "2026-03-08T06:30:00.000Z" }, // 1:30 AM EST
    { id: "after-dst", date: "2026-03-08", time: "2026-03-08T07:30:00.000Z" }, // 3:30 AM EDT
  ];
  const partition = partitionAppointmentsByEasternTime(sessions, now);

  assert.deepEqual(partition.upcoming.map((session) => session.id), ["after-dst"]);
  assert.deepEqual(partition.past.map((session) => session.id), ["before-dst"]);
});

test("distinguishes the repeated fall-back hour by its timezone offset", () => {
  const now = new Date("2026-11-01T06:00:00.000Z"); // 1:00 AM EST, after fallback
  const sessions = [
    { id: "first-130", date: "2026-11-01", time: "2026-11-01T01:30:00-04:00" },
    { id: "second-130", date: "2026-11-01", time: "2026-11-01T01:30:00-05:00" },
  ];
  const partition = partitionAppointmentsByEasternTime(sessions, now);

  assert.deepEqual(partition.upcoming.map((session) => session.id), ["second-130"]);
  assert.deepEqual(partition.past.map((session) => session.id), ["first-130"]);
  assert.equal(parseAcuityDateTime("2026-11-01T01:30:00-04:00")?.toISOString(), "2026-11-01T05:30:00.000Z");
});