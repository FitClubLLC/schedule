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
  /** Free Trial — shown at every location as an external Acuity-hosted option */
  freeTrial: string;
}

export const CANONICAL_LOCATION_KEYS = ["potomac", "kentlands"] as const;
export type CanonicalLocationKey = (typeof CANONICAL_LOCATION_KEYS)[number];

/**
 * A single bookable service at a location.
 *
 * bookingMode:
 *   "native"   — goes through native availability → confirm flow; uses calendarId.
 *   "external" — opens the Acuity hosted scheduler; calendarId is passed to the
 *                hosted URL so Acuity pre-filters to the right calendar.
 *
 * requiresCertificate:
 *   When true the service is shown only when the member holds a certificate
 *   that covers this appointmentTypeID. workoutFor1 always has this false.
 */
export interface AcuityService {
  /** Stable key used as React list key and for routing. */
  key: string;
  appointmentTypeID: string;
  /** Human-readable name shown in the service selector. */
  name: string;
  bookingMode: "native" | "external";
  /**
   * Acuity calendarID used for:
   *   native  → availability/dates, availability/times, appointment creation.
   *   external → passed as calendarID query param to the hosted scheduler URL.
   */
  calendarId: string;
  /**
   * Whether this service requires an active certificate/package.
   * false → always offered (Workout for 1, Free Trial).
   * true  → offered only when the member has a qualifying certificate.
   */
  requiresCertificate: boolean;
}

export interface AcuityLocation {
  /** Stable account-preference key; independent of Acuity IDs and display names. */
  key: CanonicalLocationKey;
  id: string;
  name: string;
  /**
   * Default Acuity calendarID for this location (used for native services
   * that do not declare their own calendarId in `services`).
   * Retained for backward-compatibility — clients should prefer the
   * per-service calendarId from `services`.
   */
  calendarId: string;
  /**
   * All bookable services at this location, in display order.
   * Clients must consume this list rather than re-implementing service
   * discovery from appointmentTypeIDs directly.
   */
  services: AcuityService[];
  /**
   * Convenience: IDs of all native services at this location.
   * Used by existing client eligibility helpers and server-side
   * configuredAppointmentTypeIds(). Do not duplicate in UI code.
   */
  appointmentTypeIDs: string[];
}

export interface AcuityTermsAcknowledgement {
  formId: string;
  fieldId: string;
}

export interface AcuityConfig {
  ownerId: string;
  appointmentTypes: AcuityAppointmentTypes;
  locations: AcuityLocation[];
  termsAcknowledgement: AcuityTermsAcknowledgement;
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

  // Calendar IDs
  const potomacCalendar    = process.env.LOCATION_1_CALENDAR_ID ?? "12741713";
  const kentlandsCalendar  = process.env.LOCATION_2_CALENDAR_ID ?? "14311114";
  // Red Light Therapy uses its own distinct Kentlands calendar (verified: 14464905).
  // Override at runtime via LOCATION_2_RED_LIGHT_CALENDAR_ID if the ID changes.
  const redLightCalendar   = process.env.LOCATION_2_RED_LIGHT_CALENDAR_ID ?? "14464905";

  // Native appointment type IDs per location (env-overridable).
  // These control what flows through native availability + booking creation.
  // Free Trial is intentionally excluded — it uses the external Acuity flow.
  const potomacNativeIds = parseTypeIds(
    process.env.LOCATION_1_APPOINTMENT_TYPE_IDS,
    [appointmentTypes.workoutFor1],
  );
  const kentlandsNativeIds = parseTypeIds(
    process.env.LOCATION_2_APPOINTMENT_TYPE_IDS,
    [appointmentTypes.workoutFor1, appointmentTypes.redLightTherapy],
  );

  // ── Build service lists ──────────────────────────────────────────────────
  // Each location gets Free Trial first (external), then native services in order.
  // Free Trial uses the location's main calendar so Acuity pre-selects it.

  function buildNativeService(
    typeId: string,
    workoutFor1Id: string,
    redLightTherapyId: string,
    locationCalendar: string,
    overrides: Record<string, string>,
  ): AcuityService {
    return {
      key: `native-${typeId}`,
      appointmentTypeID: typeId,
      name:
        typeId === workoutFor1Id
          ? "Workout for 1"
          : typeId === redLightTherapyId
          ? "Red Light Therapy Session"
          : typeId,
      bookingMode: "native",
      calendarId: overrides[typeId] ?? locationCalendar,
      requiresCertificate: typeId !== workoutFor1Id,
    };
  }

  const potomacServices: AcuityService[] = [
    {
      key: "external-free-trial-1",
      appointmentTypeID: appointmentTypes.freeTrial,
      name: "Free Trial",
      bookingMode: "external",
      calendarId: potomacCalendar,
      requiresCertificate: false,
    },
    ...potomacNativeIds.map((id) =>
      buildNativeService(
        id,
        appointmentTypes.workoutFor1,
        appointmentTypes.redLightTherapy,
        potomacCalendar,
        {},
      ),
    ),
  ];

  // Kentlands Red Light calendar override
  const kentlandsCalendarOverrides: Record<string, string> = {
    [appointmentTypes.redLightTherapy]: redLightCalendar,
  };

  const kentlandsServices: AcuityService[] = [
    {
      key: "external-free-trial-2",
      appointmentTypeID: appointmentTypes.freeTrial,
      name: "Free Trial",
      bookingMode: "external",
      calendarId: kentlandsCalendar,
      requiresCertificate: false,
    },
    ...kentlandsNativeIds.map((id) =>
      buildNativeService(
        id,
        appointmentTypes.workoutFor1,
        appointmentTypes.redLightTherapy,
        kentlandsCalendar,
        kentlandsCalendarOverrides,
      ),
    ),
  ];

  return {
    ownerId: process.env.ACUITY_OWNER_ID ?? "36930698",
    appointmentTypes,
    // These defaults were verified from Acuity's GET /forms response for the
    // required "I have read and agree to the terms above" checkbox. They
    // remain environment-configurable if the Acuity form is changed.
    termsAcknowledgement: {
      formId: process.env.ACUITY_TERMS_FORM_ID ?? "3140997",
      fieldId: process.env.ACUITY_TERMS_FIELD_ID ?? "17742013",
    },
    locations: [
      {
        key: "potomac",
        id: "1",
        name:       process.env.LOCATION_1_NAME ?? "POTOMAC",
        calendarId: potomacCalendar,
        services:   potomacServices,
        appointmentTypeIDs: potomacNativeIds,
      },
      {
        key: "kentlands",
        id: "2",
        name:       process.env.LOCATION_2_NAME ?? "KENTLANDS",
        calendarId: kentlandsCalendar,
        services:   kentlandsServices,
        appointmentTypeIDs: kentlandsNativeIds,
      },
    ],
  };
}
