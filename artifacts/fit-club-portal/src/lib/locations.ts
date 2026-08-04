export interface Location {
  id: string;
  name: string;
  /** Numeric Acuity calendarID — used to filter the booking iframe.
   *  Falls back to '' if the env var is not set; the iframe still loads,
   *  it just won't be pre-filtered to a single calendar. */
  calendarId: string;
}

/** Colour palette — index 0 = location 1, index 1 = location 2 */
export const LOCATION_COLORS = [
  {
    badge:    "border-primary/40 bg-primary/10 text-primary",
    card:     "border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10",
    selected: "border-primary ring-2 ring-primary/40 bg-primary/10",
    text:     "text-primary",
    dot:      "bg-primary/20",
  },
  {
    badge:    "border-blue-500/40 bg-blue-500/10 text-blue-400",
    card:     "border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10",
    selected: "border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/10",
    text:     "text-blue-400",
    dot:      "bg-blue-500/20",
  },
];

/**
 * Returns the configured locations.
 * Defaults to POTOMAC / KENTLANDS (the studio's two Acuity calendars).
 * Override via env vars if needed:
 *   VITE_LOCATION_1_NAME, VITE_LOCATION_1_CALENDAR_ID
 *   VITE_LOCATION_2_NAME, VITE_LOCATION_2_CALENDAR_ID
 */
export function getLocations(): Location[] {
  return [
    {
      id:         "1",
      name:       import.meta.env.VITE_LOCATION_1_NAME       ?? "POTOMAC",
      calendarId: import.meta.env.VITE_LOCATION_1_CALENDAR_ID ?? "",
    },
    {
      id:         "2",
      name:       import.meta.env.VITE_LOCATION_2_NAME       ?? "KENTLANDS",
      calendarId: import.meta.env.VITE_LOCATION_2_CALENDAR_ID ?? "",
    },
  ];
}

/** Match a location by the calendar name string Acuity returns on each appointment. */
export function getLocationByCalendarName(calendarName?: string | null): { location: Location; idx: number } | null {
  if (!calendarName) return null;
  const locs = getLocations();
  const idx = locs.findIndex(
    (l) => l.name.toLowerCase() === calendarName.toLowerCase(),
  );
  return idx >= 0 ? { location: locs[idx], idx } : null;
}
