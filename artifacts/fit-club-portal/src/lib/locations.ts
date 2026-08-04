export interface Location {
  id: string;
  name: string;
  calendarId: string;
}

export function getLocations(): Location[] {
  const locs: Location[] = [];
  const n1 = import.meta.env.VITE_LOCATION_1_NAME;
  const c1 = import.meta.env.VITE_LOCATION_1_CALENDAR_ID;
  const n2 = import.meta.env.VITE_LOCATION_2_NAME;
  const c2 = import.meta.env.VITE_LOCATION_2_CALENDAR_ID;
  if (n1 && c1) locs.push({ id: '1', name: n1, calendarId: String(c1) });
  if (n2 && c2) locs.push({ id: '2', name: n2, calendarId: String(c2) });
  return locs;
}

export function getLocationByCalendarId(calendarId?: number | null): Location | null {
  if (!calendarId) return null;
  return getLocations().find((l) => l.calendarId === String(calendarId)) ?? null;
}
