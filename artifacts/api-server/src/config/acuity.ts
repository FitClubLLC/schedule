/**
 * Acuity Scheduling configuration.
 *
 * All IDs are read from environment variables so they can be changed in one
 * place without a code deploy. The current production values are used as
 * defaults so the app works out-of-the-box.
 *
 * To update an ID: set the corresponding env var in the Replit Secrets panel.
 * Both the mobile app and web portal fetch these values from the API at
 * runtime, so changes take effect immediately on the next page load.
 */

export interface AcuityAppointmentTypes {
  /** Workout for 1 — used for member bookings at Potomac and Kentlands */
  workoutFor1: string;
  /** Red Light Therapy — available at Kentlands only */
  redLightTherapy: string;
  /** Free Trial — shown to all visitors without a certificate */
  freeTrial: string;
}

export interface AcuityLocation {
  id: string;
  name: string;
  calendarId: string;
  /**
   * Appointment type IDs (kept as strings) available through the native
   * booking flow at this location. Controlled via the
   * LOCATION_<n>_APPOINTMENT_TYPE_IDS env var (comma-separated string IDs).
   *
   * Free Trial is excluded — it always opens the external Acuity hosted UI.
   *
   * Defaults (matching the current Acuity setup):
   *   Location 1 (POTOMAC)   — workoutFor1 only
   *   Location 2 (KENTLANDS) — workoutFor1 + redLightTherapy
   */
  appointmentTypeIDs: string[];
}

export interface AcuityConfig {
  ownerId: string;
  appointmentTypes: AcuityAppointmentTypes;
  locations: AcuityLocation[];
}

/**
 * Parses a comma-separated list of appointment type IDs from an env var.
 *
 * Safety rules applied:
 *   - Trims surrounding whitespace from each segment.
 *   - Removes empty segments (handles trailing commas, double commas).
 *   - Preserves IDs as strings — no numeric coercion.
 *   - Falls back to `defaults` if the result is empty.
 */
function parseTypeIds(raw: string | undefined, defaults: string[]): string[] {
  if (!raw?.trim()) return defaults;
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : defaults;
}

export function getAcuityConfig(): AcuityConfig {
  const appointmentTypes: AcuityAppointmentTypes = {
    workoutFor1:     process.env.ACUITY_TYPE_WORKOUT_FOR_1     ?? "83398355",
    redLightTherapy: process.env.ACUITY_TYPE_RED_LIGHT_THERAPY ?? "96690076",
    freeTrial:       process.env.ACUITY_TYPE_FREE_TRIAL        ?? "83397899",
  };

  return {
    ownerId: process.env.ACUITY_OWNER_ID ?? "36930698",
    appointmentTypes,
    locations: [
      {
        id: "1",
        name:       process.env.LOCATION_1_NAME        ?? "POTOMAC",
        calendarId: process.env.LOCATION_1_CALENDAR_ID ?? "12741713",
        appointmentTypeIDs: parseTypeIds(
          process.env.LOCATION_1_APPOINTMENT_TYPE_IDS,
          [appointmentTypes.workoutFor1],
        ),
      },
      {
        id: "2",
        name:       process.env.LOCATION_2_NAME        ?? "KENTLANDS",
        calendarId: process.env.LOCATION_2_CALENDAR_ID ?? "14311114",
        appointmentTypeIDs: parseTypeIds(
          process.env.LOCATION_2_APPOINTMENT_TYPE_IDS,
          [appointmentTypes.workoutFor1, appointmentTypes.redLightTherapy],
        ),
      },
    ],
  };
}
