export const STUDIO_TIME_ZONE = "America/New_York";

export function formatStudioTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function studioHour(value: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(value)).find((part) => part.type === "hour")?.value;

  return Number(hour);
}

export function formatStudioDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const [year, month, day] = value.split("-").map(Number);
  // Midday UTC remains the same calendar day in Eastern Time and avoids
  // treating a date-only Acuity value as the prior evening.
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    ...options,
  }).format(instant);
}