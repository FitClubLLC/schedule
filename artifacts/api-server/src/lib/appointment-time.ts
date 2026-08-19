export const EASTERN_TIME_ZONE = "America/New_York";

export interface TimeClassifiableAppointment {
  date: string;
  time: string;
}

export interface AppointmentPartition<T> {
  upcoming: T[];
  past: T[];
}

function dateParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offset);
  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "-" ? -1 : 1) * minutes * 60_000;
}

function studioWallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  const utcWallTime = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offset = timeZoneOffsetMilliseconds(new Date(utcWallTime), timeZone);
  let timestamp = utcWallTime - offset;

  // Re-evaluate once at the resulting instant so dates near a DST transition use
  // the offset that applies to the scheduled appointment, not the initial guess.
  const correctedOffset = timeZoneOffsetMilliseconds(new Date(timestamp), timeZone);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    timestamp = utcWallTime - offset;
  }
  return new Date(timestamp);
}

/**
 * Parses Acuity's ISO datetime. Acuity normally includes an offset; if it does
 * not, interpret the wall-clock value in the studio timezone instead of the
 * API server's timezone.
 */
export function parseAcuityDateTime(
  value: string,
  timeZone = EASTERN_TIME_ZONE,
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const instant = new Date(trimmed);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(trimmed);
  if (!match) return null;

  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  return studioWallTimeToInstant(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
    milliseconds,
    timeZone,
  );
}

export function studioDateKey(date = new Date(), timeZone = EASTERN_TIME_ZONE): string {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Converts Acuity's datetime into the studio calendar date used throughout
 * the dashboard. This prevents an evening Eastern appointment expressed in
 * UTC from being shown on the following day.
 */
export function appointmentStudioDate(
  datetime: string | null | undefined,
  fallbackDate = "",
  timeZone = EASTERN_TIME_ZONE,
): string {
  const instant = datetime ? parseAcuityDateTime(datetime, timeZone) : null;
  return instant ? studioDateKey(instant, timeZone) : fallbackDate;
}

function dateOnlyClassification(
  date: string,
  now: Date,
  timeZone: string,
): "upcoming" | "past" {
  return date >= studioDateKey(now, timeZone) ? "upcoming" : "past";
}

function timestampForSort(appointment: TimeClassifiableAppointment, timeZone: string): number {
  return parseAcuityDateTime(appointment.time, timeZone)?.getTime() ??
    Number.POSITIVE_INFINITY;
}

/**
 * Splits Acuity's date-bounded responses by the actual appointment instant.
 * The same function is used by upcoming, past, and summary responses so a
 * session belongs to exactly one classification at UTC and DST boundaries.
 */
export function partitionAppointmentsByEasternTime<T extends TimeClassifiableAppointment>(
  appointments: T[],
  now = new Date(),
  timeZone = EASTERN_TIME_ZONE,
): AppointmentPartition<T> {
  const upcoming: T[] = [];
  const past: T[] = [];

  for (const appointment of appointments) {
    const instant = parseAcuityDateTime(appointment.time, timeZone);
    const classification = instant
      ? instant.getTime() >= now.getTime() ? "upcoming" : "past"
      : dateOnlyClassification(appointment.date, now, timeZone);
    (classification === "upcoming" ? upcoming : past).push(appointment);
  }

  upcoming.sort((a, b) => timestampForSort(a, timeZone) - timestampForSort(b, timeZone));
  past.sort((a, b) => timestampForSort(b, timeZone) - timestampForSort(a, timeZone));
  return { upcoming, past };
}