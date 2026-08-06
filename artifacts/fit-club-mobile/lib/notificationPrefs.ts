/**
 * Shared constants for notification timing preference.
 * Used by the profile screen (to write) and useSessionReminders (to read).
 */
export type NotifTiming = '24h' | '2h' | 'both' | 'off';
export const NOTIF_TIMING_KEY = '@fitclub/notification-timing';
export const PREF_LOCATION_KEY = '@fitclub/preferred-location';
export const DEFAULT_NOTIF_TIMING: NotifTiming = 'both';
