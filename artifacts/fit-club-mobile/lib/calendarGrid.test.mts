import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthGrid,
  CALENDAR_COLUMNS,
  firstWeekdayOfMonthUtc,
} from './calendarGrid.ts';

function columnForDay(year: number, month: number, day: number): number {
  const grid = buildMonthGrid(year, month);
  const row = grid.find((week) => week.includes(day));

  assert.ok(row, `Expected to find day ${day}`);
  return row.indexOf(day);
}

test('aligns September 1, 2026 under Tuesday', () => {
  assert.equal(firstWeekdayOfMonthUtc(2026, 8), 2);
  assert.equal(columnForDay(2026, 8, 1), 2);
});

test('aligns September 11, 2026 under Friday', () => {
  assert.equal(columnForDay(2026, 8, 11), 5);
});

test('aligns a month beginning on Sunday', () => {
  assert.equal(firstWeekdayOfMonthUtc(2023, 0), 0);
  assert.equal(columnForDay(2023, 0, 1), 0);
});

test('aligns a month beginning on Saturday', () => {
  assert.equal(firstWeekdayOfMonthUtc(2026, 7), 6);
  assert.equal(columnForDay(2026, 7, 1), 6);
});

test('always builds six stable rows of seven columns', () => {
  for (let month = 0; month < 12; month += 1) {
    const grid = buildMonthGrid(2026, month);
    assert.equal(grid.length, 6);
    assert.ok(grid.every((week) => week.length === CALENDAR_COLUMNS));
  }
});