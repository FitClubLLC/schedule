export const CALENDAR_COLUMNS = 7;
export const CALENDAR_ROWS = 6;

export type CalendarGridCell = number | null;

export function firstWeekdayOfMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

export function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function buildMonthGrid(year: number, month: number): CalendarGridCell[][] {
  const firstWeekday = firstWeekdayOfMonthUtc(year, month);
  const totalDays = daysInMonthUtc(year, month);
  const cells: CalendarGridCell[] = Array.from(
    { length: CALENDAR_COLUMNS * CALENDAR_ROWS },
    (_, index): CalendarGridCell => {
      const day = index - firstWeekday + 1;
      return day >= 1 && day <= totalDays ? day : null;
    },
  );

  return Array.from({ length: CALENDAR_ROWS }, (_, rowIndex) =>
    cells.slice(
      rowIndex * CALENDAR_COLUMNS,
      (rowIndex + 1) * CALENDAR_COLUMNS,
    ),
  );
}