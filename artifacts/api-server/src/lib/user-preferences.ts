import {
  CANONICAL_LOCATION_KEYS,
  getAcuityConfig,
  type AcuityLocation,
  type CanonicalLocationKey,
} from "../config/acuity.js";

export const FIT_CLUB_PREFERENCES_METADATA_KEY = "fitClubPreferences";
export const PREFERRED_LOCATION_METADATA_KEY = "preferredLocationKey";

export type PreferredLocationKey = CanonicalLocationKey;
export type PublicMetadata = Record<string, unknown>;

export type PreferredLocationParseResult =
  | { ok: true; value: PreferredLocationKey | null }
  | { ok: false };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePreferredLocationKey(
  value: unknown,
  configuredLocations: readonly AcuityLocation[] = getAcuityConfig().locations,
): PreferredLocationParseResult {
  if (value === null) {
    return { ok: true, value: null };
  }

  if (
    typeof value !== "string" ||
    !(CANONICAL_LOCATION_KEYS as readonly string[]).includes(value) ||
    !configuredLocations.some((location) => location.key === value)
  ) {
    return { ok: false };
  }

  return { ok: true, value: value as PreferredLocationKey };
}

export function readPreferredLocationKey(
  publicMetadata: unknown,
  configuredLocations: readonly AcuityLocation[] = getAcuityConfig().locations,
): PreferredLocationKey | null {
  if (!isObject(publicMetadata)) {
    return null;
  }

  const preferences = publicMetadata[FIT_CLUB_PREFERENCES_METADATA_KEY];
  if (!isObject(preferences)) {
    return null;
  }

  const parsed = parsePreferredLocationKey(
    preferences[PREFERRED_LOCATION_METADATA_KEY],
    configuredLocations,
  );
  return parsed.ok ? parsed.value : null;
}

export function mergePreferredLocationMetadata(
  publicMetadata: unknown,
  preferredLocationKey: PreferredLocationKey | null,
): PublicMetadata {
  const existingMetadata = isObject(publicMetadata) ? publicMetadata : {};
  const existingPreferences = isObject(
    existingMetadata[FIT_CLUB_PREFERENCES_METADATA_KEY],
  )
    ? existingMetadata[FIT_CLUB_PREFERENCES_METADATA_KEY]
    : {};

  return {
    ...existingMetadata,
    [FIT_CLUB_PREFERENCES_METADATA_KEY]: {
      ...existingPreferences,
      [PREFERRED_LOCATION_METADATA_KEY]: preferredLocationKey,
    },
  };
}