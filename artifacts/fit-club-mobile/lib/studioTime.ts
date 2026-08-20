export const STUDIO_TIME_ZONE = 'America/New_York';

function partsFor(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STUDIO_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function studioDateKey(date = new Date()): string {
  const parts = partsFor(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateFromCalendarKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  // Noon local time preserves the intended calendar fields for the date picker
  // without allowing a timezone conversion to change the displayed day.
  return new Date(year, month - 1, day, 12);
}

export function buildStudioDateRange(count = 14, now = new Date()): Date[] {
  const firstDateKey = studioDateKey(now);
  return Array.from({ length: count }, (_, index) =>
    dateFromCalendarKey(addCalendarDays(firstDateKey, index)),
  );
}

export function formatStudioTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

export function studioHour(value: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(value)).find((part) => part.type === 'hour')?.value;

  return Number(hour);
}

export function formatStudioTodayPart(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    ...options,
  }).format(date);
}