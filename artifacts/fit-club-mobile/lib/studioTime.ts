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