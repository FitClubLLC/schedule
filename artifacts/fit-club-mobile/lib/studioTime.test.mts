import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioDateRange,
  formatStudioTime,
  studioDateKey,
  studioHour,
} from './studioTime.ts';

test('renders Acuity offset timestamps in Eastern Time', () => {
  const acuityDatetime = '2026-08-20T15:20:00-0400';

  assert.equal(formatStudioTime(acuityDatetime), '3:20 PM');
  assert.equal(studioHour(acuityDatetime), 15);
});

test('builds reschedule dates from the Eastern studio calendar', () => {
  const instant = new Date('2026-08-20T01:30:00Z');
  assert.equal(studioDateKey(instant), '2026-08-19');

  const dates = buildStudioDateRange(3, instant);
  assert.deepEqual(
    dates.map((date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    ),
    ['2026-08-19', '2026-08-20', '2026-08-21'],
  );
});